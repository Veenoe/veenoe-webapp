"use client";

import { useEffect, useRef, useCallback } from "react";
import { useVivaStore } from "@/lib/store/viva-store";
import { GeminiLiveClientSDK } from "@/lib/gemini/live-client-sdk";
import { AudioHandler } from "@/lib/gemini/audio-handler";
import { AudioPlayer } from "@/lib/gemini/audio-player";
import { SessionState, AudioState } from "@/types/viva";
import {
  concludeViva,
} from "@/lib/api/client";

export function useVivaSession() {
  const store = useVivaStore();

  const {
    sessionId,
    setSessionState,
    setError,
    addTranscript,
    setAudioState
  } = store;

  const geminiClientRef = useRef<GeminiLiveClientSDK | null>(null);
  const audioHandlerRef = useRef<AudioHandler | null>(null);
  const audioPlayerRef = useRef<AudioPlayer | null>(null);

  // Refs to track state for VAD control
  const isAudioPlayingRef = useRef(false);
  const isTurnCompleteRef = useRef(true);

  /**
   * Handle tool calls from Gemini Live API
   */
  const handleToolCall = useCallback(
    async (toolName: string, args: Record<string, unknown>) => {
      console.log(`[useVivaSession] Handling tool call: ${toolName}`, args);
      try {
        const currentSessionId = useVivaStore.getState().sessionId;
        if (!currentSessionId) {
          console.error("[useVivaSession] No active session ID found for tool call");
          return;
        }

        switch (toolName) {
          case "conclude_viva": {
            console.log("[useVivaSession] Concluding viva session...");
            const result = await concludeViva({
              viva_session_id: currentSessionId,
              final_feedback: args.final_feedback as string,
            });
            console.log("[useVivaSession] Viva concluded successfully", result);

            useVivaStore.getState().setConclusionData({
              score: (args.score as number) || result.correct_answers,
              total: 10,
              feedback: result.final_feedback
            });
            setSessionState(SessionState.COMPLETED);
            break;
          }
          default:
            console.warn(`[useVivaSession] Unknown tool call: ${toolName}`);
        }
      } catch (error) {
        console.error(`[useVivaSession] Tool call ${toolName} failed:`, error);
      }
    },
    [setSessionState]
  );

  /**
   * Start recording audio (Internal helper)
   * This is now called internally when connection is established
   */
  const _startAudioPipeline = useCallback(async () => {
    if (!audioHandlerRef.current || !geminiClientRef.current) {
      console.warn("[useVivaSession] Cannot start audio pipeline: Handler or Client not initialized");
      return;
    }

    try {
      console.log("[useVivaSession] Starting audio recording pipeline...");
      setAudioState(AudioState.RECORDING);

      await audioHandlerRef.current.startRecording((audioData) => {
        const { isMuted, audioState } = useVivaStore.getState();

        // Only send audio if not muted AND not currently playing (AI speaking)
        // This is the CLIENT-SIDE VAD enforcement
        if (geminiClientRef.current && !isMuted && audioState === AudioState.RECORDING) {
          geminiClientRef.current.sendAudio(audioData);
        }
      });
      console.log("[useVivaSession] Audio recording started");
    } catch (error) {
      console.error("[useVivaSession] Failed to start recording:", error);
      setError("Failed to start recording");
      setAudioState(AudioState.IDLE);
    }
  }, [setAudioState, setError]);

  /**
   * Initialize the viva session with Gemini Live API
   */
  const initializeSession = useCallback(async () => {
    console.log("[useVivaSession] Initializing session...");

    // Priority order:
    // 1. Local env API key (for development)
    // 2. Ephemeral token from backend (for production)

    const localApiKey = process.env.NEXT_PUBLIC_GEMINI_API_KEY;
    const ephemeralToken = useVivaStore.getState().ephemeralToken;

    // Validate ephemeral token format
    const isValidEphemeralToken = ephemeralToken && (
      ephemeralToken.startsWith('AIza') ||
      ephemeralToken.startsWith('auth_tokens/')
    );

    // Use local key first (dev), then ephemeral (prod)
    const credentials = localApiKey || (isValidEphemeralToken ? ephemeralToken : null);

    if (!credentials) {
      console.error("[useVivaSession] No valid credentials found");
      setError("No API key or ephemeral token available. Please set NEXT_PUBLIC_GEMINI_API_KEY or start a viva session.");
      return;
    }

    try {
      setSessionState(SessionState.STARTING);

      // 1. Initialize Audio Handler and Player
      console.log("[useVivaSession] Initializing AudioHandler...");
      audioHandlerRef.current = new AudioHandler();
      await audioHandlerRef.current.initialize();

      console.log("[useVivaSession] Initializing AudioPlayer...");
      audioPlayerRef.current = new AudioPlayer({
        onPlayStart: () => {
          console.log("[useVivaSession] Audio playback started (AI speaking)");
          isAudioPlayingRef.current = true;
          setAudioState(AudioState.PLAYING);
        },
        onPlayEnd: () => {
          console.log("[useVivaSession] Audio playback ended");
          isAudioPlayingRef.current = false;

          // Only switch to recording if the turn is ALSO complete
          // This prevents interruptions if there's a small gap in audio chunks
          if (isTurnCompleteRef.current) {
            console.log("[useVivaSession] Turn complete + Audio ended -> Switching to RECORDING");
            setAudioState(AudioState.RECORDING);
          } else {
            console.log("[useVivaSession] Audio ended but turn NOT complete -> Waiting...");
          }
        },
      });
      await audioPlayerRef.current.initialize();

      // 2. Initialize Gemini Client with SDK
      console.log("[useVivaSession] Initializing GeminiLiveClientSDK...");
      geminiClientRef.current = new GeminiLiveClientSDK(credentials, {
        onConnected: () => {
          console.log("[useVivaSession] Connected to Gemini Live API");
          setSessionState(SessionState.ACTIVE);

          // 3. Start Audio Pipeline
          _startAudioPipeline();
        },
        onDisconnected: () => {
          console.log("[useVivaSession] Disconnected from Gemini Live API");
        },
        onError: (error) => {
          console.error("[useVivaSession] Gemini Live API error:", error);
          setError(error.message);
          setSessionState(SessionState.ERROR);
        },
        onAudioData: async (base64Audio, mimeType) => {
          // If we receive audio, the turn is definitely not complete (or a new one started)
          isTurnCompleteRef.current = false;

          // IMMEDIATE STATE UPDATE: Mark as playing synchronously to prevent race condition
          // where onTurnComplete might fire before playAudio starts processing
          if (!isAudioPlayingRef.current) {
            console.log("[useVivaSession] Received audio data -> Setting state to PLAYING (Sync)");
            isAudioPlayingRef.current = true;
            setAudioState(AudioState.PLAYING);
          }

          if (audioPlayerRef.current) {
            await audioPlayerRef.current.playAudio(base64Audio);
          }
        },
        onTurnComplete: () => {
          console.log("[useVivaSession] Turn complete signal received");
          isTurnCompleteRef.current = true;

          // If audio has already finished playing, we can start recording now
          if (!isAudioPlayingRef.current) {
            console.log("[useVivaSession] Turn complete + No audio playing -> Switching to RECORDING");
            setAudioState(AudioState.RECORDING);
          } else {
            console.log("[useVivaSession] Turn complete but audio still playing -> Waiting for playback end");
          }
        },
        onTranscript: (text, isFinal) => {
          addTranscript({
            role: "assistant",
            text,
            isFinal,
          });
        },
        onToolCall: async (toolName, args) => {
          await handleToolCall(toolName, args);
        },
      });

      // 5. Initiate Connection
      await geminiClientRef.current.connect();

    } catch (error) {
      console.error("[useVivaSession] Failed to initialize session:", error);
      setError(
        error instanceof Error ? error.message : "Initialization failed"
      );
      setSessionState(SessionState.ERROR);
    }
  }, [setSessionState, setError, addTranscript, handleToolCall, _startAudioPipeline]);

  /**
   * End the viva session
   */
  const endSession = useCallback(() => {
    console.log("[useVivaSession] Ending session...");
    if (geminiClientRef.current) {
      geminiClientRef.current.disconnect();
      geminiClientRef.current = null;
    }

    if (audioHandlerRef.current) {
      audioHandlerRef.current.cleanup();
      audioHandlerRef.current = null;
    }

    if (audioPlayerRef.current) {
      audioPlayerRef.current.cleanup();
      audioPlayerRef.current = null;
    }

    setSessionState(SessionState.IDLE);
    console.log("[useVivaSession] Session ended");
  }, [setSessionState]);

  /**
   * Toggle mute helper
   */
  const toggleMute = useCallback(() => {
    const { toggleMute: storeToggle } = useVivaStore.getState();
    storeToggle();
  }, []);

  /**
   * Manual Start Recording
   */
  const startRecording = useCallback(async () => {
    if (geminiClientRef.current?.getConnectionState() === "connected") {
      await _startAudioPipeline();
    }
  }, [_startAudioPipeline]);

  /**
   * Stop recording audio
   */
  const stopRecording = useCallback(() => {
    if (audioHandlerRef.current) {
      audioHandlerRef.current.stopRecording();
      setAudioState(AudioState.IDLE);
    }
  }, [setAudioState]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      endSession();
    };
  }, [endSession]);

  return {
    ...store,
    initializeSession,
    startRecording,
    stopRecording,
    endSession,
    toggleMute
  };
}