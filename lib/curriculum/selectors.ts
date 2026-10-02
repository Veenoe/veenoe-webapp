/** Read the frontend-owned catalog through parent-scoped, read-only selectors. */
import source from "../../data/curriculum/ncert-cbse-2026-27.json";
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
export const curriculum = createCurriculumSelectors(source);
