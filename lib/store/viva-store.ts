/**
 * Zustand Store for Viva Session State Management
 * Centralized state for the entire viva examination flow
 */

import { create } from "zustand";
import { SessionState, AudioState } from "@/types/viva";
import type { VivaStartResponse, GetNextQuestionResponse } from "@/types/viva";

/**
 * Transcript entry
 */
export interface Transcript {
    id: string;
    role: "user" | "assistant";
    text: string;
    timestamp: number;
    isFinal: boolean;
}

/**
 * Viva session store state
 */
interface VivaSessionStore {
    // Session data
    sessionId: string | null;
    ephemeralToken: string | null;
    voiceName: string;
    sessionDurationMinutes: number;
    sessionState: SessionState;

    // Current question
    currentQuestion: GetNextQuestionResponse | null;

    // Audio state
    audioState: AudioState;
    isMuted: boolean;

    // Transcripts
    transcripts: Transcript[];

    // Timer
    timeRemaining: number; // in seconds
    timerWarningShown: boolean;

    // Error handling
    error: string | null;

    // Conclusion Data
    conclusionData: {
        score: number;
        total: number;
        feedback: string;
    } | null;
    setConclusionData: (data: { score: number; total: number; feedback: string }) => void;

    // Actions
    setSessionData: (data: VivaStartResponse) => void;
    setSessionState: (state: SessionState) => void;
    setCurrentQuestion: (question: GetNextQuestionResponse | null) => void;
    setAudioState: (state: AudioState) => void;
    toggleMute: () => void;
    addTranscript: (transcript: Omit<Transcript, "id" | "timestamp">) => void;
    updateTranscript: (id: string, updates: Partial<Transcript>) => void;
    setTimeRemaining: (seconds: number) => void;
    setTimerWarning: (shown: boolean) => void;
    setError: (error: string | null) => void;
    resetSession: () => void;
}

/**
 * Initial state
 */
const initialState = {
    sessionId: null,
    ephemeralToken: null,
    voiceName: "Kore",
    sessionDurationMinutes: 10,
    sessionState: SessionState.IDLE,
    currentQuestion: null,
    audioState: AudioState.IDLE,
    isMuted: false,
    transcripts: [],
    timeRemaining: 600, // 10 minutes in seconds
    timerWarningShown: false,
    error: null,
    conclusionData: null,
};

/**
 * Create the Zustand store
 */
export const useVivaStore = create<VivaSessionStore>((set) => ({
    ...initialState,

    setSessionData: (data) =>
        set({
            sessionId: data.viva_session_id,
            ephemeralToken: data.ephemeral_token,
            voiceName: data.voice_name,
            sessionDurationMinutes: data.session_duration_minutes,
            timeRemaining: data.session_duration_minutes * 60,
        }),

    setSessionState: (state) => set({ sessionState: state }),

    setCurrentQuestion: (question) => set({ currentQuestion: question }),

    setAudioState: (state) => set({ audioState: state }),

    toggleMute: () => set((state) => ({ isMuted: !state.isMuted })),

    addTranscript: (transcript) =>
        set((state) => ({
            transcripts: [
                ...state.transcripts,
                {
                    ...transcript,
                    id: `transcript-${Date.now()}-${Math.random()}`,
                    timestamp: Date.now(),
                },
            ],
        })),

    updateTranscript: (id, updates) =>
        set((state) => ({
            transcripts: state.transcripts.map((t) =>
                t.id === id ? { ...t, ...updates } : t
            ),
        })),

    setTimeRemaining: (seconds) => set({ timeRemaining: seconds }),

    setTimerWarning: (shown) => set({ timerWarningShown: shown }),

    setError: (error) => set({ error }),

    setConclusionData: (data) => set({ conclusionData: data }),

    resetSession: () => set(initialState),
}));
