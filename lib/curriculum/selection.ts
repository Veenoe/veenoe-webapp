/** Selection rules shared by the setup form and its unconfirmed topic dropdown. */
import { curriculum, CATALOG_ID, CATALOG_VERSION } from "./selectors";
import type { CurriculumSelection } from "./types";
import type { VivaStartRequest } from "../../types/viva";

/** Editable focus for one chapter; empty topic lists mean the entire chapter. */
export interface ChapterSelection {
  chapterId: string;
  topicIds: string[];
  customTopics: string[];
}
/** IDs are kept in form state; names are resolved from the catalog at submission. */
export interface CurriculumSelectionState {
  classLevel: number;
  subjectId: string;
  chapters: ChapterSelection[];
}
export const initialSelection: CurriculumSelectionState = {
  classLevel: 5,
  subjectId: "",
  chapters: [],
};
/** UI-only choice: it clears topic filters and is never sent as a catalog topic. */
export const ENTIRE_CHAPTER = "entire-chapter";
/** Match the backend custom-topic limit: nonblank, single-line text up to 100 characters. */
export const validCustomTopic = (value: string) =>
  !!value.trim() &&
  value.trim().length <= 100 &&
  !/[\u0000-\u001f\u007f]/.test(value);

/** Derive dropdown choices from their parents, retaining unavailable subjects for display. */
export function getSelectionView(selection: CurriculumSelectionState) {
  const subjects = curriculum.getSubjectCatalog(selection.classLevel);
  const subject = subjects.find((s) => s.id === selection.subjectId);
  const chapters = curriculum.getChapters(selection);
  const selectedChapters = chapters.filter((ch) =>
    selection.chapters.some((s) => s.chapterId === ch.id),
  );
  return {
    classLevels: curriculum.getClassLevels(),
    subjects,
    subject,
    chapters,
    selectedChapters,
    nextAction: !subjects.length
      ? "Try another class"
      : !subject
        ? "Choose a subject"
        : !selectedChapters.length
          ? "Choose a chapter"
          : "Ready when you are",
  };
}
export type CurriculumSelectionView = ReturnType<typeof getSelectionView>;
export type SelectionAction =
  | { type: "class"; value: number }
  | { type: "subject"; value: string }
  | { type: "chapter"; value: string }
  | { type: "topics"; value: ChapterSelection }
  | { type: "topic"; chapterId: string; value: string }
  | {
      type: "custom-topic" | "remove-custom-topic";
      chapterId: string;
      value: string;
    };
const toggle = (values: string[], value: string) =>
  values.includes(value)
    ? values.filter((v) => v !== value)
    : [...values, value];

/**
 * Apply a selection change without mutating the current state.
 * Changing class or subject clears dependent choices; changing chapter replaces
 * the single chapter and starts with entire-chapter coverage. Invalid choices
 * leave state unchanged. The topics action commits a validated dropdown draft.
 */
export function selectionReducer(
  state: CurriculumSelectionState,
  action: SelectionAction,
): CurriculumSelectionState {
  if (action.type === "class")
    return state.classLevel === action.value
      ? state
      : { ...initialSelection, classLevel: action.value };
  if (action.type === "subject")
    return state.subjectId === action.value
      ? state
      : { ...state, subjectId: action.value, chapters: [] };
  if (action.type === "chapter") {
    if (!curriculum.getChapters(state).some((ch) => ch.id === action.value))
      return state;
    if (
      state.chapters.length === 1 &&
      state.chapters[0].chapterId === action.value
    )
      return state;
    return {
      ...state,
      chapters: [{ chapterId: action.value, topicIds: [], customTopics: [] }],
    };
  }
  // Confirm commits the whole draft; reject it if its chapter has changed.
  if (action.type === "topics") {
    if (state.chapters[0]?.chapterId !== action.value.chapterId) return state;
    const next = {
      ...state,
      chapters: [
        {
          ...action.value,
          topicIds: [...action.value.topicIds],
          customTopics: [...action.value.customTopics],
        },
      ],
    };
    return getCurriculumSelection(next) ? next : state;
  }
  return {
    ...state,
    chapters: state.chapters.map((ch) => {
      if (ch.chapterId !== action.chapterId) return ch;
      if (action.type === "topic") {
        if (action.value === ENTIRE_CHAPTER)
          return { ...ch, topicIds: [], customTopics: [] };
        if (
          !curriculum
            .getTopics({ ...state, chapterId: ch.chapterId })
            .some((t) => t.id === action.value)
        )
          return ch;
        return { ...ch, topicIds: toggle(ch.topicIds, action.value) };
      }
      const name = action.value.trim();
      if (action.type === "remove-custom-topic")
        return {
          ...ch,
          customTopics: ch.customTopics.filter((t) => t !== name),
        };
      if (
        !validCustomTopic(name) ||
        ch.customTopics.some(
          (t) => t.toLocaleLowerCase() === name.toLocaleLowerCase(),
        ) ||
        ch.customTopics.length >= 20
      )
        return ch;
      // Typing an existing topic selects its catalog ID instead of creating a duplicate.
      const preset = curriculum
        .getTopics({ ...state, chapterId: ch.chapterId })
        .find((t) => t.name.toLocaleLowerCase() === name.toLocaleLowerCase());
      if (preset)
        return ch.topicIds.includes(preset.id)
          ? ch
          : { ...ch, topicIds: [...ch.topicIds, preset.id] };
      return { ...ch, customTopics: [...ch.customTopics, name] };
    }),
  };
}

/**
 * Resolve selected IDs into the lean API selection, or return null when incomplete
 * or invalid. Check each ID under its parent so stale choices cannot cross subjects
 * or chapters. Difficulty and catalog-only fields are excluded from the request.
 */
export function getCurriculumSelection(
  selection: CurriculumSelectionState,
): CurriculumSelection | null {
  const subject = curriculum
    .getSubjects(selection.classLevel)
    .find((s) => s.id === selection.subjectId);
  if (
    !subject ||
    selection.chapters.length !== 1 ||
    new Set(selection.chapters.map((ch) => ch.chapterId)).size !==
      selection.chapters.length
  )
    return null;
  const chapters: CurriculumSelection["chapters"] = [];
  for (const selected of selection.chapters) {
    const chapter = subject.chapters.find((ch) => ch.id === selected.chapterId);
    if (
      !chapter ||
      selected.customTopics.length > 20 ||
      selected.customTopics.some((t) => !validCustomTopic(t)) ||
      new Set(selected.topicIds).size !== selected.topicIds.length ||
      new Set(selected.customTopics.map((t) => t.trim().toLocaleLowerCase()))
        .size !== selected.customTopics.length
    )
      return null;
    const topics: { id: string; name: string }[] = [];
    for (const id of selected.topicIds) {
      const topic = chapter.topics.find((t) => t.id === id);
      if (!topic) return null;
      topics.push({ id: topic.id, name: topic.name });
    }
    // Custom IDs identify session choices, not entries in the static catalog.
    topics.push(
      ...selected.customTopics.map((name, i) => ({
        id: `custom-topic-${i + 1}`,
        name: name.trim(),
      })),
    );
    if (topics.length > 100) return null;
    chapters.push({ id: chapter.id, name: chapter.name, topics });
  }
  return {
    catalog_id: CATALOG_ID,
    catalog_version: CATALOG_VERSION,
    class_level: selection.classLevel,
    subject_id: subject.id,
    subject_name: subject.name,
    chapters,
  };
}
/** A named student and one valid chapter are required; block duplicate starts while submitting. */
export function canStartViva(
  selection: CurriculumSelectionState,
  studentName: string,
  isSubmitting = false,
) {
  return (
    !isSubmitting &&
    !!studentName.trim() &&
    getCurriculumSelection(selection) !== null
  );
}
/**
 * Convert a resolved selection into the backend start contract.
 * The readable topic string supplies session titles/history; curriculum_selection
 * supplies the examiner scope. Topic IDs remain in the request for persistence.
 */
export function mapVivaRequest(
  studentName: string,
  voiceName: string,
  curriculumSelection: CurriculumSelection,
): VivaStartRequest {
  return {
    student_name: studentName.trim(),
    class_level: String(curriculumSelection.class_level),
    topic: curriculumSelection.chapters
      .map((ch) =>
        ch.topics.length
          ? `${ch.name}: ${ch.topics.map((t) => t.name).join(", ")}`
          : ch.name,
      )
      .join("; "),
    curriculum_selection: curriculumSelection,
    session_type: "viva",
    voice_name: voiceName,
    enable_thinking: false,
    thinking_budget: 0,
  };
}
