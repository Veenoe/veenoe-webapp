// veenoe-webapp/lib/store/viva-store.ts
import { create } from "zustand";
import { startVivaSession, VivaStartRequest } from "@/lib/api";

/* ----------------------------- Types ----------------------------- */

export interface LLMEvaluation {
  evaluation: string;
  new_question: string;
}

export interface Message {
  speaker: "ai" | "user";
  text: string;
  timestamp: string; // ISO string
  ai_evaluation?: LLMEvaluation;
}

export type VivaState =
  | "idle"
  | "connecting"
  | "connected" // AI is done, user *can* speak
  | "listening" // Mic is actively on and capturing
  | "processing" // User finished, AI is thinking (Future)
  | "speaking" // AI is talking
  | "error";

/* ---------------------- Audio Player State ---------------------- */

export interface AudioPlayerState {
  mediaSource: MediaSource | null;
  sourceBuffer: SourceBuffer | null;
  audioElement: HTMLAudioElement | null;
  isPlayerInitialized: boolean;
  audioQueue: ArrayBuffer[];
}

/* ----------------------- Audio Capture State ---------------------- */

export interface AudioCaptureState {
  mediaStream: MediaStream | null;
  audioContext: AudioContext | null;
  mediaStreamSource: MediaStreamAudioSourceNode | null;
  workletNode: AudioWorkletNode | null;
}

/* --------------------------- Store Types --------------------------- */

export interface VivaStore {
  // --- STATE ---
  sessionId: string | null;
  socket: WebSocket | null;
  vivaState: VivaState;
  transcript: Message[];
  error: string | null;
  player: AudioPlayerState;
  capture: AudioCaptureState;

  // --- ACTIONS ---
  startSession: (data: VivaStartRequest) => Promise<string>;
  connectToViva: (sessionId: string) => void;
  disconnect: () => void;
  initializeMicrophone: () => Promise<void>;
  startListening: () => Promise<void>;
  stopListening: () => void;
  sendAudioChunk: (chunk: ArrayBuffer) => void;

  // --- PLAYER ACTIONS ---
  initializePlayer: (audioElement: HTMLAudioElement) => void;
  _playAudioChunk: (chunk: ArrayBuffer) => void;

  // --- INTERNAL ACTIONS ---
  _handleSocketOpen: () => void;
  _handleSocketMessage: (event: MessageEvent) => void;
  _handleSocketError: (error: string) => void;
  _handleSocketClose: () => void;
  _addMessageToTranscript: (message: Message) => void;
}

/* --------------------------- Constants --------------------------- */

const WS_URL =
  process.env.NEXT_PUBLIC_BACKEND_WS_URL || "ws://localhost:8000";
const TARGET_SAMPLE_RATE = 16000; // Must match backend ASR

const initialPlayerState: AudioPlayerState = {
  mediaSource: null,
  sourceBuffer: null,
  audioElement: null,
  isPlayerInitialized: false,
  audioQueue: [],
};

const initialCaptureState: AudioCaptureState = {
  mediaStream: null,
  audioContext: null,
  mediaStreamSource: null,
  workletNode: null,
};

const initialState = {
  sessionId: null,
  socket: null,
  vivaState: "idle" as VivaState,
  transcript: [],
  error: null,
  player: initialPlayerState,
  capture: initialCaptureState,
};

/* --------------------------- Store --------------------------- */

export const useVivaStore = create<VivaStore>((set, get) => ({
  ...initialState,

  /* ----------------------- Session Control ----------------------- */
  startSession: async (data) => {
    set({ ...initialState, vivaState: "connecting", error: null });
    try {
      const response = await startVivaSession(data);
      set({ sessionId: response.session_id });
      return response.session_id;
    } catch (err) {
      const error =
        err instanceof Error ? err.message : "An unknown error occurred";
      set({ vivaState: "error", error });
      throw err;
    }
  },

  connectToViva: (sessionId) => {
    const { socket, vivaState } = get();
    if (socket || vivaState === "connecting") return;

    set({ vivaState: "connecting", error: null });

    const ws = new WebSocket(`${WS_URL}/ws/viva/${sessionId}`);
    ws.binaryType = "arraybuffer"; // <-- Fix 1: Receive ArrayBuffers

    ws.onopen = () => get()._handleSocketOpen();
    ws.onmessage = (event) => get()._handleSocketMessage(event);
    ws.onerror = () => get()._handleSocketError("WebSocket error");
    ws.onclose = () => get()._handleSocketClose();

    set({ socket: ws, sessionId });
  },

  disconnect: () => {
    const { socket } = get();
    get().stopListening(); // Clean up mic
    if (socket) socket.close();
    set(initialState);
  },

  /* ----------------------- Audio Capture ----------------------- */

  initializeMicrophone: async () => {
    // This pre-warms the mic to get permission early
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: { 
          echoCancellation: true,  // Faster/more reliable on some devices
          noiseSuppression: true 
        } 
      });
      stream.getTracks().forEach((track) => track.stop());
      console.log("STORE: Mic pre-warmed successfully.");
    } catch (err) {
      console.error("Microphone permission error on init:", err);
      set({
        vivaState: "error",
        error: "Microphone permission was denied. Please grant permission and refresh.",
      });
    }
  },

  startListening: async () => {
    const { capture, vivaState } = get();
    if (capture.audioContext || vivaState === "speaking") {
      return;
    }

    try {
      set({ vivaState: "listening" });

      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: { 
          echoCancellation: true,  // Faster/more reliable on some devices
          noiseSuppression: true 
        } 
      });
      const audioContext = new AudioContext();

      await audioContext.resume();

      // Add worklet module with error handling
      try {
        await audioContext.audioWorklet.addModule("/resampler-worklet.js");
      } catch (moduleErr) {
        console.error("Failed to load resampler worklet:", moduleErr);
        throw new Error("Audio processing module failed to load. Please refresh.");
      }

      const source = audioContext.createMediaStreamSource(stream);

      // **ROBUSTNESS**: Try-catch around AudioWorkletNode creation
      let workletNode: AudioWorkletNode;
      try {
        workletNode = new AudioWorkletNode(
          audioContext,
          "resampler-worklet-processor",
        );
      } catch (nodeErr) {
        console.error("Failed to create AudioWorkletNode:", nodeErr);
        throw new Error("Audio processing node failed to initialize. Please refresh.");
      }

      workletNode.port.postMessage({
        targetSampleRate: TARGET_SAMPLE_RATE,
      });

      // PRIMARY FIX: Connect source -> worklet -> destination to start processing
      source.connect(workletNode);
      workletNode.connect(audioContext.destination);

      // Enhanced port handler with logging
      workletNode.port.onmessage = (event) => {
        const chunk = event.data as ArrayBuffer;
        console.log(`WORKLET: Produced audio chunk (${chunk.byteLength} bytes), sending to store...`);
        get().sendAudioChunk(chunk);
      };

      // ROBUSTNESS: Handle worklet errors
      workletNode.onprocessorerror = (err) => {
        console.error("Worklet processor error:", err);
        get().stopListening();
        set({ vivaState: "error", error: "Audio processing error. Please try speaking again." });
      };

      set({
        capture: {
          mediaStream: stream,
          audioContext: audioContext,
          mediaStreamSource: source,
          workletNode: workletNode,
        },
      });

      console.log("STORE: Microphone listening started successfully.");
    } catch (err) {
      console.error("Error starting microphone:", err);
      set({
        vivaState: "error",
        error: `Microphone permission denied or an error occurred: ${err instanceof Error ? err.message : 'Unknown error'}.`,
      });
    }
  },

  stopListening: () => {
    const { capture } = get();
    if (!capture.audioContext) {
      return;
    }

    capture.mediaStreamSource?.disconnect(capture.workletNode!);
    capture.workletNode?.port.close();
    capture.mediaStream?.getTracks().forEach((track) => track.stop());
    capture.audioContext.close();

    set({ capture: initialCaptureState });
  },

  sendAudioChunk: (chunk) => {
    const { socket, vivaState } = get();
    console.log(`STORE: sendAudioChunk called. State: ${vivaState}, Socket: ${socket?.readyState}`);
    if (
      socket &&
      socket.readyState === WebSocket.OPEN &&
      vivaState === "listening"
    ) {
        console.log(`STORE: Sending ${chunk.byteLength} bytes to WebSocket.`);
      socket.send(chunk);
    }
  },

  /* ----------------------- Player Initialization ----------------------- */
  initializePlayer: (audioElement) => {
    const mediaSource = new MediaSource();
    audioElement.src = URL.createObjectURL(mediaSource);

    mediaSource.addEventListener("sourceopen", () => {
      const sourceBuffer = mediaSource.addSourceBuffer("audio/mpeg");

      sourceBuffer.addEventListener("updateend", () => {
        const { audioQueue } = get().player;
        if (audioQueue.length > 0) {
          const nextChunk = audioQueue.shift()!;
          if (!sourceBuffer.updating) sourceBuffer.appendBuffer(nextChunk);
        }
      });

      set({
        player: {
          ...get().player,
          mediaSource,
          sourceBuffer,
          isPlayerInitialized: true,
        },
      });
    });

    set({
      player: {
        ...get().player,
        audioElement,
      },
    });
  },

  _playAudioChunk: (chunk) => {
    // Turn-taking logic: AI is speaking, so stop user listening.
    get().stopListening();
    set({ vivaState: "speaking" });

    const { sourceBuffer, audioQueue, audioElement } = get().player;

    if (sourceBuffer && !sourceBuffer.updating) {
      sourceBuffer.appendBuffer(chunk);
    } else {
      audioQueue.push(chunk);
      set({ player: { ...get().player, audioQueue } });
    }

    if (audioElement && audioElement.paused) {
      audioElement.play().catch((e) => console.error("Audio play failed", e));
    }
  },

  /* ----------------------- WebSocket Handlers ----------------------- */
  _handleSocketOpen: () => {
    set({ vivaState: "connected", error: null });
    set({ vivaState: "speaking" }); // AI starts speaking first
  },

  _handleSocketMessage: (event) => {
    if (event.data instanceof ArrayBuffer) {
      get()._playAudioChunk(event.data);
    } else if (typeof event.data === "string") {
      try {
        const message = JSON.parse(event.data);
        if (message.type === "speech_end") {
          // Turn-taking logic: AI is done, start user listening.
          set({ vivaState: "connected" });
          get().startListening();
        }
      } catch (e) {
        console.error("Failed to parse control message", event.data);
      }
    }
  },

  _handleSocketError: (error) => {
    set({ vivaState: "error", error });
  },

  _handleSocketClose: () => {
    get().stopListening(); // Clean up mic on close
    set({ vivaState: "idle" });
  },

  /* ----------------------- Transcript ----------------------- */
  _addMessageToTranscript: (message) =>
    set((state) => ({
      transcript: [...state.transcript, message],
    })),
}));