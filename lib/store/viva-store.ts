/**
 * Zustand Store for Viva Session State Management
 */

import { create } from "zustand";
import {
  SessionState,
  MicrophoneState,
  ConversationState,
  PlaybackState,
} from "@/types/viva";
import type { VivaStartResponse } from "@/types/viva";

export interface Transcript {
  id: string;
  role: "user" | "assistant";
  text: string;
  timestamp: number;
  isFinal: boolean;
  source?: "input" | "output";
  completion?: "protocol" | "local" | "open";
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
  vadProfile: string | null;
  googleApiVersion: string;
  tokenExpiresAt: string | null;
  newSessionExpiresAt: string | null;
  sessionDeadlineAt: string | null;
  sessionResumptionEnabled: boolean;
  connectionStatus:
    | "connecting"
    | "connected"
    | "reconnecting"
    | "disconnected";
  connectionNotice: string | null;
  voiceName: string;
  sessionDurationMinutes: number;
  sessionState: SessionState;

  // Audio state
  microphoneState: MicrophoneState;
  conversationState: ConversationState;
  playbackState: PlaybackState;
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
  setMicrophoneState: (state: MicrophoneState) => void;
  setConversationState: (state: ConversationState) => void;
  setPlaybackState: (state: PlaybackState) => void;
  toggleMute: () => void;
  addTranscript: (transcript: Omit<Transcript, "id" | "timestamp">) => void;
  upsertTranscript: (transcript: Omit<Transcript, "timestamp">) => void;
  updateTranscript: (id: string, updates: Partial<Transcript>) => void;
  setTimeRemaining: (seconds: number) => void;
  setTimerWarning: (shown: boolean) => void;
  setError: (error: string | null) => void;
  clearLiveCredentials: () => void;

  // -- NEW: Action to set conclusion data --
  setConclusionData: (data: ConclusionData | null) => void;

  resetSession: () => void;
}

const initialState = {
  sessionId: null,
  ephemeralToken: null,
  googleModel: null,
  vadProfile: null,
  googleApiVersion: "v1beta",
  tokenExpiresAt: null,
  newSessionExpiresAt: null,
  sessionDeadlineAt: null,
  sessionResumptionEnabled: false,
  connectionStatus: "disconnected" as const,
  connectionNotice: null,
  voiceName: "Kore",
  sessionDurationMinutes: 5,
  sessionState: SessionState.IDLE,
  microphoneState: MicrophoneState.IDLE,
  conversationState: ConversationState.LISTENING,
  playbackState: PlaybackState.IDLE,
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
      vadProfile: data.vad_profile ?? null,
      googleApiVersion: data.google_api_version ?? "v1beta",
      tokenExpiresAt: data.token_expires_at ?? null,
      newSessionExpiresAt: data.new_session_expires_at ?? null,
      sessionDeadlineAt: data.session_deadline_at ?? null,
      sessionResumptionEnabled: data.session_resumption_enabled ?? false,
      connectionStatus: "connecting",
      connectionNotice: null,
      voiceName: data.voice_name,
      sessionDurationMinutes: data.session_duration_minutes,
      timeRemaining: data.session_duration_minutes * 60,
    }),

  setSessionState: (state) => set({ sessionState: state }),
  clearLiveCredentials: () =>
    set({
      ephemeralToken: null,
      tokenExpiresAt: null,
      newSessionExpiresAt: null,
      sessionResumptionEnabled: false,
      connectionStatus: "disconnected",
    }),

  setMicrophoneState: (state) => set({ microphoneState: state }),
  setConversationState: (state) => set({ conversationState: state }),
  setPlaybackState: (state) => set({ playbackState: state }),

  toggleMute: () => set((state) => ({ isMuted: !state.isMuted })),

  addTranscript: (transcript) =>
    set((state) => ({
      transcripts: [
        ...state.transcripts,
        {
          ...transcript,
          // crypto.randomUUID() guarantees uniqueness, unlike Date.now()+Math.random()
          id: crypto.randomUUID(),
          timestamp: Date.now(),
        },
      ],
    })),
  upsertTranscript: (transcript) =>
    set((state) => {
      const existing = state.transcripts.find(
        (item) => item.id === transcript.id,
      );
      return {
        transcripts: existing
          ? state.transcripts.map((item) =>
              item.id === transcript.id ? { ...item, ...transcript } : item,
            )
          : [...state.transcripts, { ...transcript, timestamp: Date.now() }],
      };
    }),

  updateTranscript: (id, updates) =>
    set((state) => ({
      transcripts: state.transcripts.map((t) =>
        t.id === id ? { ...t, ...updates } : t,
      ),
    })),

  setTimeRemaining: (seconds) => set({ timeRemaining: seconds }),

  setTimerWarning: (shown) => set({ timerWarningShown: shown }),

  setError: (error) => set({ error }),

  setConclusionData: (data) => set({ conclusionData: data }),

  resetSession: () => set(initialState),
}));
