/**
 * TypeScript type definitions for the Viva Examination System
 * These types match the backend API schemas exactly
 */

/**
 * Request payload for starting a new viva session
 */
export interface VivaStartRequest {
    /** Student's full name */
    student_name: string;
    /** The Clerk User ID */
    user_id: string;
    /** Topic/subject for the viva examination */
    topic: string;
    /** Student's grade/class level (1-12) */
    class_level: number;
    /** Optional: Session type (default: "viva") */
    session_type?: string;
    /** Optional: AI voice selection (default: "Kore") */
    voice_name?: string;
    /** Optional: Enable thinking capabilities (default: true) */
    enable_thinking?: boolean;
    /** Optional: Thinking token budget 0-8192 (default: 1024) */
    thinking_budget?: number;
}

/**
 * Response from starting a new viva session
 */
export interface VivaStartResponse {
    /** Unique identifier for the viva session */
    viva_session_id: string;
    /** Ephemeral token for Gemini Live API connection */
    ephemeral_token: string;
    /** Google AI model being used */
    google_model: string;
    /** Maximum session duration in minutes */
    session_duration_minutes: number;
    /** Selected voice for AI responses */
    voice_name: string;
}

/**
 * Request for getting the next question
 */
export interface GetNextQuestionRequest {
    /** Viva session identifier */
    viva_session_id: string;
    /** Topic for the question */
    topic: string;
    /** Student's class level */
    class_level: number;
    /** Desired difficulty level (1-5) */
    current_difficulty: number;
}

/**
 * Response containing the next question
 */
export interface GetNextQuestionResponse {
    /** The question text */
    question_text: string;
    /** Question difficulty level */
    difficulty: number;
    /** Unique question identifier */
    question_id: string;
}

/**
 * Request for evaluating a student's response
 */
export interface EvaluateResponseRequest {
    /** Viva session identifier */
    viva_session_id: string;
    /** The question that was asked */
    question_text: string;
    /** ID of the question that was asked */
    question_id?: string;
    /** Question difficulty level */
    difficulty: number;
    /** Student's transcribed answer */
    student_answer: string;
    /** AI's evaluation of the answer */
    evaluation: string;
    /** Whether the answer was correct */
    is_correct: boolean;
}

/**
 * Response after evaluating a response
 */
export interface EvaluateResponseResponse {
    /** Operation status */
    status: string;
    /** Status message */
    message: string;
    /** Turn/question number */
    turn_id: number;
}

/**
 * Request for concluding a viva session
 */
export interface ConcludeVivaRequest {
    /** Viva session identifier */
    viva_session_id: string;
    /** AI's final feedback and summary */
    final_feedback: string;
}

/**
 * Response after concluding a viva session
 */
export interface ConcludeVivaResponse {
    /** Completion status */
    status: string;
    /** Status message */
    message: string;
    /** Total number of questions asked */
    total_questions: number;
    /** Number of correct answers */
    correct_answers: number;
    /** Final feedback from AI */
    final_feedback: string;
}

/**
 * Available AI voices for the viva
 */
export const AVAILABLE_VOICES = [
    { value: "Kore", label: "Kore (Default)" },
    { value: "Puck", label: "Puck" },
    { value: "Charon", label: "Charon" },
    { value: "Aoede", label: "Aoede" },
    { value: "Fenrir", label: "Fenrir" },
] as const;

/**
 * Session state enum
 */
export enum SessionState {
    IDLE = "idle",
    STARTING = "starting",
    ACTIVE = "active",
    PAUSED = "paused",
    CONCLUDING = "concluding",
    COMPLETED = "completed",
    ERROR = "error",
}

/**
 * Audio state enum
 */
export enum AudioState {
    IDLE = "idle",
    RECORDING = "recording",
    PLAYING = "playing",
    PROCESSING = "processing",
}

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
