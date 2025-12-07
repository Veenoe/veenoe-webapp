/**
 * Zustand Store for Viva Session State Management
 */

import { create } from "zustand";
import { SessionState, AudioState, VivaFeedback } from "@/types/viva";
import type { VivaStartResponse } from "@/types/viva";

export interface Transcript {
    id: string;
    role: "user" | "assistant";
    text: string;
    timestamp: number;
    isFinal: boolean;
}

// Helper type for the conclusion popup data
export interface ConclusionData {
    score: number;
    total: number;
    feedback: string;
}

interface VivaSessionStore {
    // Session data
    sessionId: string | null;
    ephemeralToken: string | null;
    googleModel: string | null;
    voiceName: string;
    sessionDurationMinutes: number;
    sessionState: SessionState;

    // Audio state
    audioState: AudioState;
    isMuted: boolean;

    // Transcripts
    transcripts: Transcript[];

    // Timer
    timeRemaining: number;
    timerWarningShown: boolean;

    // Error handling
    error: string | null;

    // -- NEW: Conclusion Data for Popup --
    conclusionData: ConclusionData | null;

    // Actions
    setSessionData: (data: VivaStartResponse) => void;
    setSessionState: (state: SessionState) => void;
    setAudioState: (state: AudioState) => void;
    toggleMute: () => void;
    addTranscript: (transcript: Omit<Transcript, "id" | "timestamp">) => void;
    updateTranscript: (id: string, updates: Partial<Transcript>) => void;
    setTimeRemaining: (seconds: number) => void;
    setTimerWarning: (shown: boolean) => void;
    setError: (error: string | null) => void;

    // -- NEW: Action to set conclusion data --
    setConclusionData: (data: ConclusionData | null) => void;

    resetSession: () => void;
}

const initialState = {
    sessionId: null,
    ephemeralToken: null,
    googleModel: null,
    voiceName: "Kore",
    sessionDurationMinutes: 5,
    sessionState: SessionState.IDLE,
    audioState: AudioState.IDLE,
    isMuted: false,
    transcripts: [],
    timeRemaining: 300,
    timerWarningShown: false,
    error: null,
    conclusionData: null, // Initialize as null
};

export const useVivaStore = create<VivaSessionStore>((set) => ({
    ...initialState,

    setSessionData: (data) =>
        set({
            sessionId: data.viva_session_id,
            ephemeralToken: data.ephemeral_token,
            googleModel: data.google_model,
            voiceName: data.voice_name,
            sessionDurationMinutes: data.session_duration_minutes,
            timeRemaining: data.session_duration_minutes * 60,
        }),

    setSessionState: (state) => set({ sessionState: state }),

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