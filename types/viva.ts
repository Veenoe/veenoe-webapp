/**
 * TypeScript type definitions for the Viva Examination System
 */

export interface VivaStartRequest {
    student_name: string;
    // Note: user_id removed - now extracted from JWT on server-side
    topic: string;
    class_level: number;
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
}

// Structured Feedback
export interface VivaFeedback {
    score: number;
    summary: string;
    strong_points: string[];
    areas_of_improvement: string[];
}

// Session Object
export interface VivaSession {
    viva_session_id: string;
    student_name: string;
    topic: string;
    class_level: number;
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

export enum AudioState {
    IDLE = "idle",
    RECORDING = "recording",
    PLAYING = "playing",
    PROCESSING = "processing",
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
    class_level: number;
    started_at: string;
    session_type: string;
    status: string;
}

export interface HistoryResponse {
    sessions: VivaSessionSummary[];
}