/**
 * TypeScript type definitions for the Viva Examination System
 */

import type { CurriculumSelection } from "../lib/curriculum/types";

/** Backend start payload: the resolved selection defines scope; topic is the readable session label. */
export interface VivaStartRequest {
  curriculum_selection?: CurriculumSelection;
  student_name: string;
  // Note: user_id removed - now extracted from JWT on server-side
  topic: string;
  class_level: string;
  session_type?: string;
  voice_name?: string;
  enable_thinking?: boolean;
  thinking_budget?: number;
}

export interface VivaStartResponse {
  viva_session_id: string;
  ephemeral_token: string;
  google_model: string;
  session_duration_minutes: number;
  voice_name: string;
  vad_profile?: string | null;
  google_api_version?: string;
  token_expires_at?: string | null;
  new_session_expires_at?: string | null;
  session_deadline_at?: string | null;
  session_resumption_enabled?: boolean;
}

// Structured Feedback
export interface VivaFeedback {
  score: number;
  summary: string;
  strong_points: string[];
  areas_of_improvement: string[];
  next_steps?: string[];
  coverage_note?: string | null;
}

// Session Object
export interface VivaSession {
  viva_session_id: string;
  student_name: string;
  topic: string;
  class_level: string;
  status: string;
  started_at: string;
  ended_at?: string;
  feedback?: VivaFeedback | null;
}

// Conclude Request
export interface ConcludeVivaRequest {
  viva_session_id: string;
  score: number;
  summary: string;
  strong_points: string[];
  areas_of_improvement: string[];
  next_steps?: string[];
  coverage_note?: string | null;
}

export interface ConcludeVivaResponse {
  status: string;
  score: number;
  final_feedback: string;
}

export enum SessionState {
  IDLE = "idle",
  STARTING = "starting",
  ACTIVE = "active",
  PAUSED = "paused",
  CONCLUDING = "concluding",
  COMPLETED = "completed",
  ERROR = "error",
}

export enum MicrophoneState {
  IDLE = "idle",
  ACTIVE = "active",
}

export enum ConversationState {
  LISTENING = "listening",
  THINKING = "thinking",
  SPEAKING = "speaking",
}

export enum PlaybackState {
  IDLE = "idle",
  PLAYING = "playing",
}

export const AVAILABLE_VOICES = [
  { value: "Kore", label: "Kore (Default)" },
  { value: "Puck", label: "Puck" },
  { value: "Charon", label: "Charon" },
  { value: "Aoede", label: "Aoede" },
  { value: "Fenrir", label: "Fenrir" },
] as const;

export interface VivaSessionSummary {
  viva_session_id: string;
  title: string;
  topic: string;
  class_level: string;
  started_at: string;
  session_type: string;
  status: string;
}

export interface HistoryResponse {
  next_cursor?: string | null;
  sessions: VivaSessionSummary[];
}
