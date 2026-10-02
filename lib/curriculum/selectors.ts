/** Read class catalog chunks through parent-scoped, read-only selectors. */
import manifest from "../../data/curriculum/manifest.json";
import type {
  CurriculumClass,
  CurriculumSubject,
  CurriculumChapter,
  CurriculumTopic,
  DifficultyLevel,
} from "./types";

const record = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const text = (v: unknown): v is string => typeof v === "string" && !!v.trim();
const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const difficulty = (v: unknown): DifficultyLevel => (text(v) ? v : null);
/** A subject without chapters stays visible in the catalog but cannot start a viva. */
export const isSubjectAvailable = (subject: CurriculumSubject) =>
  subject.chapters.length > 0;

/**
 * Normalize an unknown catalog into safe dropdown choices once at creation.
 * Malformed entries are omitted rather than exposed as selectable values. Source
 * order is preserved; empty chapter/topic lists are valid. Missing difficulty
 * becomes null because no difficulty rating has been assigned yet.
 */
export function createCurriculumSelectors(data: unknown) {
  const classes: CurriculumClass[] = (
    record(data) ? list(data.classes) : []
  ).flatMap((c) => {
    if (
      !record(c) ||
      !text(c.id) ||
      !Number.isInteger(c.classLevel) ||
      Number(c.classLevel) < 5 ||
      Number(c.classLevel) > 12
    )
      return [];
    const subjects: CurriculumSubject[] = list(c.subjects).flatMap((s) => {
      if (!record(s) || !text(s.id) || !text(s.name)) return [];
      const chapters: CurriculumChapter[] = list(s.chapters).flatMap((ch) => {
        if (!record(ch) || !text(ch.id) || !text(ch.name)) return [];
        const topics: CurriculumTopic[] = list(ch.topics).flatMap((t) =>
          record(t) && text(t.id) && text(t.name)
            ? [
                {
                  id: t.id,
                  name: t.name,
                  difficultyLevel: difficulty(t.difficultyLevel),
                },
              ]
            : [],
        );
        return [
          {
            id: ch.id,
            name: ch.name,
            difficultyLevel: difficulty(ch.difficultyLevel),
            topics,
          },
        ];
      });
      return [{ id: s.id, name: s.name, chapters }];
    });
    return [{ id: c.id, classLevel: Number(c.classLevel), subjects }];
  });
  /** Include all subjects so missing chapter mappings are visible to the student. */
  const getSubjectCatalog = (
    classLevel: number,
  ): readonly CurriculumSubject[] =>
    classes.find((c) => c.classLevel === classLevel)?.subjects ?? [];
  /** Only subjects with chapters can resolve into a session selection. */
  const getSubjects = (classLevel: number) =>
    getSubjectCatalog(classLevel).filter(isSubjectAvailable);
  /** Resolve within the selected class and subject; an unknown parent yields no choices. */
  const getChapters = ({
    classLevel,
    subjectId,
  }: {
    classLevel: number;
    subjectId: string;
  }) => getSubjects(classLevel).find((s) => s.id === subjectId)?.chapters ?? [];
  /** Resolve within one chapter so similarly named topics in other chapters stay separate. */
  const getTopics = (path: {
    classLevel: number;
    subjectId: string;
    chapterId: string;
  }) => getChapters(path).find((ch) => ch.id === path.chapterId)?.topics ?? [];
  return {
    getClassLevels: () => classes.map((c) => c.classLevel),
    getSubjects,
    getSubjectCatalog,
    getChapters,
    getTopics,
  };
}
export const CATALOG_ID = manifest.catalog_id;
export const CATALOG_VERSION = manifest.catalog_version;

const classLoaders: Record<number, () => Promise<{ default: unknown }>> = {
  5: () => import("../../data/curriculum/class-5.json"),
  6: () => import("../../data/curriculum/class-6.json"),
  7: () => import("../../data/curriculum/class-7.json"),
  8: () => import("../../data/curriculum/class-8.json"),
  9: () => import("../../data/curriculum/class-9.json"),
  10: () => import("../../data/curriculum/class-10.json"),
  11: () => import("../../data/curriculum/class-11.json"),
  12: () => import("../../data/curriculum/class-12.json"),
};

/** Cache class chunks independently; failed loads can be retried without a page reload. */
export function createClassCatalogCache(
  loaders: typeof classLoaders,
  classLevels: readonly number[],
) {
  const loaded = new Map<
    number,
    ReturnType<typeof createCurriculumSelectors>
  >();
  const pending = new Map<number, Promise<void>>();
  const empty = createCurriculumSelectors(null);
  const forClass = (classLevel: number) => loaded.get(classLevel) ?? empty;
  return {
    async loadClass(classLevel: number): Promise<void> {
      if (loaded.has(classLevel)) return;
      if (!classLevels.includes(classLevel) || !loaders[classLevel])
        throw new Error("Unsupported class");
      let request = pending.get(classLevel);
      if (!request) {
        request = loaders[classLevel]()
          .then((module) => {
            const selectors = createCurriculumSelectors(module.default);
            if (
              selectors.getClassLevels().length !== 1 ||
              selectors.getClassLevels()[0] !== classLevel
            )
              throw new Error("Unexpected class catalog");
            loaded.set(classLevel, selectors);
          })
          .finally(() => pending.delete(classLevel));
        pending.set(classLevel, request);
      }
      await request;
    },
    getClassLevels: () => [...classLevels],
    getSubjectCatalog: (classLevel: number) =>
      forClass(classLevel).getSubjectCatalog(classLevel),
    getSubjects: (classLevel: number) =>
      forClass(classLevel).getSubjects(classLevel),
    getChapters: (path: { classLevel: number; subjectId: string }) =>
      forClass(path.classLevel).getChapters(path),
    getTopics: (path: {
      classLevel: number;
      subjectId: string;
      chapterId: string;
    }) => forClass(path.classLevel).getTopics(path),
  };
}

/** Only the small manifest is eager; selecting a class loads its separate chunk. */
export const curriculum = createClassCatalogCache(
  classLoaders,
  manifest.classLevels,
);
