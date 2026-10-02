import assert from "node:assert/strict";
import test, { before } from "node:test";
import source from "../data/curriculum/ncert-cbse-2026-27.json";
import {
  curriculum,
  createCurriculumSelectors,
  createClassCatalogCache,
  CATALOG_ID,
  CATALOG_VERSION,
} from "../lib/curriculum/selectors";
import {
  initialSelection,
  selectionReducer,
  getCurriculumSelection,
  getSelectionView,
  canStartViva,
  mapVivaRequest,
  ENTIRE_CHAPTER,
} from "../lib/curriculum/selection";
import type { CurriculumSelectionState } from "../lib/curriculum/selection";

// Tests explicitly preload all classes; the application loads only its chosen class.
before(async () => {
  await Promise.all(
    curriculum.getClassLevels().map((level) => curriculum.loadClass(level)),
  );
});

const subject = createCurriculumSelectors(source)
  .getSubjects(7)
  .find((s) => s.id === "science")!;
const chapters = subject.chapters.slice(1, 3);
const selected = (): CurriculumSelectionState => ({
  classLevel: 7,
  subjectId: subject.id,
  chapters: [{ chapterId: chapters[0].id, topicIds: [], customTopics: [] }],
});
const keys = (value: object) => Object.keys(value).sort();

test("all classes 5–12 keep their subjects in a minimal dataset", () => {
  assert.deepEqual(curriculum.getClassLevels(), [5, 6, 7, 8, 9, 10, 11, 12]);
  assert.deepEqual(keys(source), ["classes"]);
  for (const c of source.classes) {
    assert.deepEqual(keys(c), ["classLevel", "id", "subjects"]);
    assert.equal(c.id, `class-${c.classLevel}`);
    assert.equal(new Set(c.subjects.map((s) => s.id)).size, c.subjects.length);
    assert.deepEqual(
      curriculum.getSubjectCatalog(c.classLevel).map((s) => s.id),
      c.subjects.map((s) => s.id),
    );
    for (const s of c.subjects) {
      assert.deepEqual(keys(s), ["chapters", "id", "name"]);
      assert.equal(
        new Set(s.chapters.map((ch) => ch.id)).size,
        s.chapters.length,
      );
      for (const ch of s.chapters) {
        assert.deepEqual(keys(ch), ["difficultyLevel", "id", "name", "topics"]);
        assert.ok(ch.name.trim());
        assert.equal(ch.difficultyLevel, null);
        assert.equal(
          new Set(ch.topics.map((t) => t.id)).size,
          ch.topics.length,
        );
        for (const t of ch.topics) {
          assert.deepEqual(keys(t), ["difficultyLevel", "id", "name"]);
          assert.equal(t.difficultyLevel, null);
          assert.notEqual(t.id, ENTIRE_CHAPTER);
          assert.ok(t.name.trim());
        }
        if (s.id.startsWith("english") || s.id.startsWith("hindi"))
          assert.deepEqual(ch.topics, []);
      }
    }
  }
});

test("English and EVS expose lessons instead of broad units", () => {
  assert.equal(
    curriculum.getChapters({ classLevel: 5, subjectId: "english" }).length,
    10,
  );
  assert.equal(
    curriculum.getChapters({ classLevel: 6, subjectId: "english" }).length,
    16,
  );
  assert.ok(
    curriculum
      .getChapters({ classLevel: 5, subjectId: "english" })
      .some((ch) => ch.name === "Papa's Spectacles"),
  );
  assert.equal(
    curriculum.getChapters({ classLevel: 5, subjectId: "the-world-around-us" })
      .length,
    10,
  );
  assert.ok(
    curriculum
      .getChapters({ classLevel: 7, subjectId: "mathematics" })
      .some((ch) => ch.name === "Finding the Unknown"),
  );
  assert.ok(
    curriculum
      .getChapters({ classLevel: 12, subjectId: "accountancy" })
      .some((ch) => ch.name === "Accounting Ratios"),
  );
});

test("selectors scope chapters and topics to their parent and tolerate bad siblings", () => {
  assert.deepEqual(curriculum.getSubjects(1), []);
  assert.deepEqual(
    curriculum.getChapters({ classLevel: 7, subjectId: "unknown" }),
    [],
  );
  assert.deepEqual(
    curriculum.getTopics({
      classLevel: 7,
      subjectId: subject.id,
      chapterId: "unknown",
    }),
    [],
  );
  assert.deepEqual(createCurriculumSelectors(null).getClassLevels(), []);
  const selectors = createCurriculumSelectors({
    classes: [
      null,
      {
        id: "class-7",
        classLevel: 7,
        subjects: [null, { ...subject, chapters: [null, ...subject.chapters] }],
      },
    ],
  });
  assert.deepEqual(selectors.getChapters(selected()), subject.chapters);
});

test("choosing a chapter replaces the previous choice and preserves a repeated choice", () => {
  let state = selectionReducer(
    { ...initialSelection, classLevel: 7 },
    { type: "subject", value: subject.id },
  );
  assert.equal(getSelectionView(state).nextAction, "Choose a chapter");
  state = selectionReducer(state, { type: "chapter", value: chapters[0].id });
  assert.deepEqual(state, selected());
  assert.equal(canStartViva(state, "Student"), true);
  assert.equal(canStartViva(state, ""), false);
  assert.equal(canStartViva(state, "   "), false);
  assert.equal(getSelectionView(state).nextAction, "Ready when you are");
  state = selectionReducer(state, {
    type: "custom-topic",
    chapterId: chapters[0].id,
    value: "My topic",
  });
  assert.equal(
    selectionReducer(state, { type: "chapter", value: chapters[0].id }),
    state,
  );
  state = selectionReducer(state, { type: "chapter", value: chapters[1].id });
  assert.deepEqual(state.chapters, [
    { chapterId: chapters[1].id, topicIds: [], customTopics: [] },
  ]);
  assert.equal(getCurriculumSelection(state)?.chapters.length, 1);
  assert.equal(
    selectionReducer(state, { type: "chapter", value: "unknown" }),
    state,
  );
});

test("several topics stay scoped to their chapter", () => {
  let state = selected();
  for (const t of chapters[0].topics.slice(0, 2))
    state = selectionReducer(state, {
      type: "topic",
      chapterId: chapters[0].id,
      value: t.id,
    });
  assert.equal(getCurriculumSelection(state)?.chapters[0].topics.length, 2);
  state = selectionReducer(state, {
    type: "topic",
    chapterId: chapters[0].id,
    value: chapters[0].topics[0].id,
  });
  assert.equal(state.chapters[0].topicIds.length, 1);
  const before = state.chapters[0];
  state = selectionReducer(state, {
    type: "topic",
    chapterId: chapters[0].id,
    value: chapters[1].topics[0].id,
  });
  assert.deepEqual(state.chapters[0], before);
});

test("custom topics coexist with preset topics, deduplicate and can be removed", () => {
  let state = selected();
  state = selectionReducer(state, {
    type: "topic",
    chapterId: chapters[0].id,
    value: chapters[0].topics[0].id,
  });
  for (const value of [
    "  Red cabbage indicator  ",
    "Testing lemon juice",
    "red cabbage indicator",
    " ",
    "x".repeat(101),
    "line\nbreak",
  ]) {
    state = selectionReducer(state, {
      type: "custom-topic",
      chapterId: chapters[0].id,
      value,
    });
  }
  assert.deepEqual(state.chapters[0].customTopics, [
    "Red cabbage indicator",
    "Testing lemon juice",
  ]);
  const context = getCurriculumSelection(state)!;
  assert.equal(context.chapters[0].topics.length, 3);
  assert.deepEqual(context.chapters[0].topics[1], {
    id: "custom-topic-1",
    name: "Red cabbage indicator",
  });
  state = selectionReducer(state, {
    type: "custom-topic",
    chapterId: chapters[0].id,
    value: chapters[0].topics[0].name.toUpperCase(),
  });
  assert.equal(state.chapters[0].topicIds.length, 1);
  assert.equal(state.chapters[0].customTopics.length, 2);
  state = selectionReducer(state, {
    type: "remove-custom-topic",
    chapterId: chapters[0].id,
    value: "Testing lemon juice",
  });
  assert.equal(state.chapters[0].customTopics.length, 1);
  state = selectionReducer(state, {
    type: "topic",
    chapterId: chapters[0].id,
    value: ENTIRE_CHAPTER,
  });
  assert.deepEqual(state.chapters[0], {
    chapterId: chapters[0].id,
    topicIds: [],
    customTopics: [],
  });
});

test("changing chapter, class or subject discards its descendants", () => {
  const state = selectionReducer(selected(), {
    type: "custom-topic",
    chapterId: chapters[0].id,
    value: "An indicator",
  });
  assert.deepEqual(selectionReducer(state, { type: "class", value: 8 }), {
    ...initialSelection,
    classLevel: 8,
  });
  assert.deepEqual(
    selectionReducer(state, { type: "subject", value: "mathematics" }).chapters,
    [],
  );
  assert.equal(selectionReducer(state, { type: "class", value: 7 }), state);
  assert.equal(
    selectionReducer(state, { type: "subject", value: subject.id }),
    state,
  );
  let removed = selectionReducer(state, {
    type: "chapter",
    value: chapters[1].id,
  });
  removed = selectionReducer(removed, {
    type: "chapter",
    value: chapters[0].id,
  });
  assert.deepEqual(
    removed.chapters.find((ch) => ch.chapterId === chapters[0].id)
      ?.customTopics,
    [],
  );
});

test("every mapped chapter starts without needing stored topics", () => {
  for (const c of source.classes)
    for (const s of curriculum.getSubjects(c.classLevel))
      for (const ch of s.chapters) {
        const state = {
          classLevel: c.classLevel,
          subjectId: s.id,
          chapters: [{ chapterId: ch.id, topicIds: [], customTopics: [] }],
        };
        assert.equal(
          canStartViva(state, "Student"),
          true,
          `${c.classLevel}/${s.id}/${ch.id}`,
        );
        assert.deepEqual(getCurriculumSelection(state)?.chapters[0].topics, []);
      }
});

test("stale, duplicated or invalid selections cannot start", () => {
  assert.equal(canStartViva(initialSelection, "Student"), false);
  assert.equal(canStartViva(selected(), ""), false);
  assert.equal(canStartViva(selected(), "Student", true), false);
  assert.equal(
    getCurriculumSelection({ ...selected(), subjectId: "unknown" }),
    null,
  );
  for (const bad of [
    { chapterId: "unknown", topicIds: [], customTopics: [] },
    { chapterId: chapters[0].id, topicIds: ["unknown"], customTopics: [] },
    {
      chapterId: chapters[0].id,
      topicIds: [],
      customTopics: ["x".repeat(101)],
    },
    { chapterId: chapters[0].id, topicIds: [], customTopics: ["one", "ONE"] },
  ])
    assert.equal(
      getCurriculumSelection({ ...selected(), chapters: [bad] }),
      null,
    );
  const state = selected();
  assert.equal(
    getCurriculumSelection({
      ...state,
      chapters: [
        state.chapters[0],
        { chapterId: chapters[1].id, topicIds: [], customTopics: [] },
      ],
    }),
    null,
  );
  assert.equal(
    getCurriculumSelection({
      ...state,
      chapters: [state.chapters[0], state.chapters[0]],
    }),
    null,
  );
});

test("request includes catalog identity and one chapter without difficulty", () => {
  const state = selectionReducer(selected(), {
    type: "custom-topic",
    chapterId: chapters[0].id,
    value: "Testing lemon juice",
  });
  const context = getCurriculumSelection(state)!;
  const request = mapVivaRequest(" Student ", "Puck", context);
  assert.equal(request.student_name, "Student");
  assert.equal(request.voice_name, "Puck");
  assert.equal(request.class_level, "7");
  assert.deepEqual(request.curriculum_selection, context);
  assert.equal(request.topic, `${chapters[0].name}: Testing lemon juice`);
  assert.deepEqual(keys(context), [
    "catalog_id",
    "catalog_version",
    "chapters",
    "class_level",
    "subject_id",
    "subject_name",
  ]);
  assert.ok(!JSON.stringify(context).includes("difficulty"));
  assert.ok(!("classes" in request));
});

test("topic confirmation applies presets and custom topics together and rejects stale chapters", () => {
  const state = selected();
  let draft = selectionReducer(state, {
    type: "topic",
    chapterId: chapters[0].id,
    value: chapters[0].topics[0].id,
  });
  draft = selectionReducer(draft, {
    type: "custom-topic",
    chapterId: chapters[0].id,
    value: "My topic",
  });
  assert.deepEqual(state.chapters[0].topicIds, []);
  assert.deepEqual(state.chapters[0].customTopics, []);
  const confirmed = selectionReducer(state, {
    type: "topics",
    value: draft.chapters[0],
  });
  assert.deepEqual(confirmed, draft);
  assert.equal(getCurriculumSelection(confirmed)?.chapters[0].topics.length, 2);
  assert.equal(
    selectionReducer(state, {
      type: "topics",
      value: { ...draft.chapters[0], chapterId: chapters[1].id },
    }),
    state,
  );
  assert.equal(
    selectionReducer(state, {
      type: "topics",
      value: { ...draft.chapters[0], topicIds: ["unknown"] },
    }),
    state,
  );
  assert.deepEqual(
    selectionReducer(confirmed, { type: "topics", value: state.chapters[0] }),
    state,
  );
});

test("class catalog loads only requested classes, deduplicates requests and retries failures", async () => {
  const calls: number[] = [];
  let fail = true;
  const cache = createClassCatalogCache(
    {
      5: async () => {
        calls.push(5);
        return { default: { classes: [source.classes[0]] } };
      },
      7: async () => {
        calls.push(7);
        if (fail) throw new Error("offline");
        return { default: { classes: [source.classes[2]] } };
      },
    },
    [5, 7],
  );
  assert.deepEqual(cache.getSubjects(5), []);
  await Promise.all([cache.loadClass(5), cache.loadClass(5)]);
  assert.deepEqual(calls, [5]);
  assert.ok(cache.getSubjects(5).length);
  assert.deepEqual(cache.getSubjects(7), []);
  await assert.rejects(cache.loadClass(7));
  fail = false;
  await cache.loadClass(7);
  assert.ok(cache.getSubjects(7).length);
  assert.deepEqual(calls, [5, 7, 7]);
  await assert.rejects(cache.loadClass(12));
});

test("a class chunk cannot populate a different class", async () => {
  const cache = createClassCatalogCache(
    { 7: async () => ({ default: { classes: [source.classes[0]] } }) },
    [7],
  );
  await assert.rejects(cache.loadClass(7), /Unexpected class catalog/);
  assert.deepEqual(cache.getSubjects(7), []);
});

test("class chunks and the manifest exactly match the source catalog", async () => {
  const { readFile } = await import("node:fs/promises");
  const { createHash } = await import("node:crypto");
  const sortKeys = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(sortKeys);
    if (value !== null && typeof value === "object")
      return Object.fromEntries(
        Object.entries(value)
          .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
          .map(([key, item]) => [key, sortKeys(item)]),
      );
    return value;
  };
  // Match Python's ensure_ascii serialization used to stamp the packaged server catalog.
  const canonical = JSON.stringify(sortKeys(source)).replace(
    /[\u007f-\uffff]/g,
    (char) => `\\u${char.charCodeAt(0).toString(16).padStart(4, "0")}`,
  );
  assert.equal(CATALOG_ID, "ncert-cbse");
  assert.equal(
    CATALOG_VERSION,
    "sha256-" + createHash("sha256").update(canonical).digest("hex"),
  );
  for (const grade of source.classes) {
    const chunk = JSON.parse(
      await readFile(
        new URL(
          `../data/curriculum/class-${grade.classLevel}.json`,
          import.meta.url,
        ),
        "utf8",
      ),
    );
    assert.deepEqual(chunk, { classes: [grade] });
  }
});
