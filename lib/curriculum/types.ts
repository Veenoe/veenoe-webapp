/** Reserved for a future rating scheme; null means unrated, not easy. */
export type DifficultyLevel = string | null;
/** A suggested catalog topic; students can also supply their own session topics. */
export interface CurriculumTopic {
  id: string;
  name: string;
  difficultyLevel: DifficultyLevel;
}
/** One catalog chapter; an empty topics list still allows entire-chapter assessment. */
export interface CurriculumChapter {
  id: string;
  name: string;
  difficultyLevel: DifficultyLevel;
  topics: readonly CurriculumTopic[];
}
/** A class-specific subject. Empty chapters make it visible but unavailable for selection. */
export interface CurriculumSubject {
  id: string;
  name: string;
  chapters: readonly CurriculumChapter[];
}
/** The subject catalog for one supported school class, from 5 through 12. */
export interface CurriculumClass {
  id: string;
  classLevel: number;
  subjects: readonly CurriculumSubject[];
}
/**
 * Resolved selection shared by the webapp and backend API.
 * New vivas contain exactly one chapter; empty topics means the entire chapter.
 * The webapp resolves names from its catalog and sends them to the backend
 * as the session curriculum snapshot. The backend does not verify catalog membership.
 * Catalog identity describes a dataset revision, not an official textbook edition.
 * Difficulty is kept in the catalog and is not sent to the session.
 */
export interface CurriculumSelection {
  catalog_id: string;
  catalog_version: string;
  class_level: number;
  subject_id: string;
  subject_name: string;
  chapters: {
    id: string;
    name: string;
    topics: { id: string; name: string }[];
  }[];
}
