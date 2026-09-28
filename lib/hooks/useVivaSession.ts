"use client";

import { useEffect, useRef, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@clerk/nextjs";
import { useVivaStore } from "@/lib/store/viva-store";
import { GeminiLiveClientSDK } from "@/lib/gemini/live-client-sdk";
import { AudioRecorder, MicrophoneError } from "@/lib/gemini/audio-recorder";
import { AudioPlayer } from "@/lib/gemini/audio-player";
import {
  SessionState,
  MicrophoneState,
  ConversationState,
  PlaybackState,
} from "@/types/viva";
import { voiceTelemetry } from "@/lib/telemetry/voice-telemetry";
import { createToolHandler } from "./viva/tool-handlers";
import { createAudioPipeline } from "./viva/audio-pipeline";
import { abandonViva } from "@/lib/api/axios";
import { applyAbandonOutcome } from "./viva/session-lifecycle";

export function useVivaSession() {
  const router = useRouter();
  const { getToken } = useAuth();
  const store = useVivaStore();

  const {
    setSessionState,
    setError,
    addTranscript,
    setMicrophoneState,
    setConversationState,
    setPlaybackState,
  } = store;

  // Refs for managing resources
  const geminiClientRef = useRef<GeminiLiveClientSDK | null>(null);
  const audioHandlerRef = useRef<AudioRecorder | null>(null);
  const audioPlayerRef = useRef<AudioPlayer | null>(null);

  // State tracking refs
  const isAudioPlayingRef = useRef(false);
  const isTurnCompleteRef = useRef(true);
  const isConclusionPendingRef = useRef(false);
  const isConclusionSavingRef = useRef(false);
  const abandonmentRef = useRef<Promise<void> | null>(null);

  // Cleanup all resources
  const cleanupResources = useCallback(() => {
    // Flag as intentional so normal teardown is not counted as an unexpected connection drop
    voiceTelemetry.setIntentionalDisconnect(true);
    voiceTelemetry.onSessionEnded();

    setMicrophoneState(MicrophoneState.IDLE);
    setPlaybackState(PlaybackState.IDLE);
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
  }, [setMicrophoneState, setPlaybackState]);

  // Finalize session state (show popup)
  const finishConclusion = useCallback(() => {
    console.log("[useVivaSession] Finalizing session...");
    setSessionState(SessionState.COMPLETED);
    cleanupResources();
    isConclusionPendingRef.current = false;
  }, [cleanupResources, setSessionState]);

  const abandonSession = useCallback(() => {
    const sessionId = useVivaStore.getState().sessionId;
    if (!sessionId || abandonmentRef.current) {
      return abandonmentRef.current ?? Promise.resolve();
    }
    const pending = abandonViva(sessionId)
      .then((response) => {
        if (useVivaStore.getState().sessionId === sessionId) {
          applyAbandonOutcome(response, sessionId, {
            setSessionState,
            cleanupResources,
            navigate: (path) => router.push(path),
          });
        }
      })
      .catch(() => {
        if (useVivaStore.getState().sessionId === sessionId) {
          setError("Could not end the session. Please try again.");
          setSessionState(SessionState.ERROR);
        }
        throw new Error("Session abandonment failed");
      })
      .finally(() => {
        abandonmentRef.current = null;
      });
    abandonmentRef.current = pending;
    return pending;
  }, [cleanupResources, router, setError, setSessionState]);

  // Create audio pipeline controller
  // Existing controller factory retains refs; it does not read their values during render.
  const audioPipeline = useMemo(() => createAudioPipeline({
    setConversationState,
    setPlaybackState,
    isConclusionPendingRef,
    isTurnCompleteRef,
    isAudioPlayingRef,
    finishConclusion,
  }), [setConversationState, setPlaybackState, finishConclusion]);

  // Create tool handler (with auth token getter for API calls)
  const handleToolCall = useMemo(() => createToolHandler({
    setError,
    finishConclusion,
    isAudioPlayingRef,
    isConclusionPendingRef,
    getToken,
    abandonSession,
    isConclusionSavingRef,
  }), [setError, finishConclusion, getToken, abandonSession]);

  // Start audio pipeline
  const _startAudioPipeline = useCallback(async () => {
    if (!audioHandlerRef.current || !geminiClientRef.current) return;

    try {
      await audioHandlerRef.current.startRecording((audioData: ArrayBuffer) => {
        const client = geminiClientRef.current;
        if (!client) return;
        const { microphoneState, isMuted } = useVivaStore.getState();
        audioPipeline.forwardMicrophoneAudio(
          audioData,
          microphoneState,
          isMuted,
          (data) => client.sendAudio(data),
          (byteLength) => voiceTelemetry.onMicrophonePacketSent(byteLength),
          () => voiceTelemetry.onMicrophonePacketsDropped(1),
        );
      }, (count) => voiceTelemetry.onMicrophonePacketsDropped(count),
        (format) => voiceTelemetry.onMicrophoneFormat(format),
        (level) => voiceTelemetry.onMicrophoneLevel(level));
      setMicrophoneState(MicrophoneState.ACTIVE);
      setConversationState(ConversationState.LISTENING);
    } catch (error) {
      audioHandlerRef.current?.cleanup();
      const micError = error instanceof MicrophoneError ? error : new MicrophoneError('processing');
      voiceTelemetry.onMicrophoneError(micError.code);
      setError(micError.message);
      setMicrophoneState(MicrophoneState.IDLE);
      setSessionState(SessionState.ERROR);
      void abandonSession().catch(() => {});
    }
  }, [audioPipeline, setMicrophoneState, setConversationState, setError, setSessionState, abandonSession]);

  // Initialize session
  const initializeSession = useCallback(async () => {
    const ephemeralToken = useVivaStore.getState().ephemeralToken;
    if (!ephemeralToken) return;

    try {
      setSessionState(SessionState.STARTING);
      isConclusionPendingRef.current = false;
      audioPipeline.reset();

      const googleModel = useVivaStore.getState().googleModel;
      const vadProfile = useVivaStore.getState().vadProfile;

      // Initialize fresh anonymous telemetry baseline
      voiceTelemetry.onSessionInitStart(googleModel ?? undefined, vadProfile ?? undefined);

      // Initialize audio recorder (handles microphone input)
      audioHandlerRef.current = new AudioRecorder();
      await audioHandlerRef.current.initialize(() => {
        const micError = new MicrophoneError('ended');
        voiceTelemetry.onMicrophoneError(micError.code);
        setError(micError.message);
        setMicrophoneState(MicrophoneState.IDLE);
        setSessionState(SessionState.ERROR);
        void abandonSession().catch(() => {});
      });
      const microphoneDiagnostics = audioHandlerRef.current.getMicrophoneDiagnostics();
      if (!microphoneDiagnostics) throw new MicrophoneError('ended');
      voiceTelemetry.onMicrophoneDiagnostics(microphoneDiagnostics);
      voiceTelemetry.onMicrophoneReady();

      // Initialize audio player with pipeline callbacks and telemetry hooks
      audioPlayerRef.current = new AudioPlayer(
        audioPipeline.createPlaybackCallbacks({
          onPlayStart: () => voiceTelemetry.onPlaybackStarted(),
          onPlayEnd: () => voiceTelemetry.onPlaybackEnded(),
          onAudioScheduled: (queueDurationMs) => voiceTelemetry.onAudioScheduled(queueDurationMs),
          onUnderrun: () => voiceTelemetry.onPlaybackUnderrun(),
        })
      );
      await audioPlayerRef.current.initialize();
      voiceTelemetry.onAudioPlayerReady();

      // Initialize clean Gemini Live SDK transport
      geminiClientRef.current = new GeminiLiveClientSDK(
        ephemeralToken,
        {
          onConnected: () => {
            if (!audioHandlerRef.current?.getMicrophoneDiagnostics()) return;
            voiceTelemetry.onGeminiConnected();
            setSessionState(SessionState.ACTIVE);
            _startAudioPipeline();
          },
          onSetupComplete: () => {
            voiceTelemetry.onGeminiSetupComplete();
          },
          onDisconnected: () => {
            voiceTelemetry.onGeminiDisconnected();
            const state = useVivaStore.getState().sessionState;
            if (
              state === SessionState.ACTIVE ||
              state === SessionState.STARTING ||
              (state === SessionState.CONCLUDING &&
                !isConclusionSavingRef.current &&
                !useVivaStore.getState().conclusionData)
            ) {
              void abandonSession().catch(() => {});
            }
          },
          onError: (e) => {
            voiceTelemetry.onGeminiError(e);
            setError(e.message);
            const state = useVivaStore.getState().sessionState;
            setSessionState(SessionState.ERROR);
            if (
              state === SessionState.ACTIVE ||
              state === SessionState.STARTING ||
              (state === SessionState.CONCLUDING &&
                !isConclusionSavingRef.current &&
                !useVivaStore.getState().conclusionData)
            ) {
              void abandonSession().catch(() => {});
            }
          },
          onReconnectAttempt: (attempt) => {
            voiceTelemetry.onConnectionRetry(attempt);
          },
          onAudioData: async (base64) => {
            const player = audioPlayerRef.current;
            if (!player) return;
            await audioPipeline.receiveGeminiAudio(
              base64,
              (audio) => player.playAudio(audio),
              () => voiceTelemetry.onGeminiAudioChunkReceived(),
            );
          },
          onTurnComplete: () => {
            audioPipeline.completeTurn(() => voiceTelemetry.onTurnComplete());
          },
          onInterrupted: () => {
            audioPipeline.interruptPlayback(
              () => audioPlayerRef.current?.stop(),
              () => voiceTelemetry.onInterruptionSignalReceived(),
              () => voiceTelemetry.onPlaybackStoppedDueToInterruption(),
              () => voiceTelemetry.onInterruptionWithoutPlayback(),
            );
          },
          onTranscript: (text, isFinal) => addTranscript({ role: "assistant", text, isFinal }),
          onToolCall: handleToolCall,
        },
        googleModel ?? undefined
      );

      if (!audioHandlerRef.current?.getMicrophoneDiagnostics()) throw new MicrophoneError('ended');
      await geminiClientRef.current.connect();
    } catch (err) {
      audioHandlerRef.current?.cleanup();
      if (err instanceof MicrophoneError) {
        voiceTelemetry.onMicrophoneError(err.code);
        setError(err.message);
      } else {
        voiceTelemetry.onGeminiError(err);
        setError(err instanceof Error ? err.message : "Connection failed");
      }
      setSessionState(SessionState.ERROR);
      void abandonSession().catch(() => {});
    }
  }, [
    setSessionState,
    setMicrophoneState,
    setError,
    addTranscript,
    handleToolCall,
    _startAudioPipeline,
    audioPipeline,
    abandonSession,
  ]);

  // Request conclusion from AI
  const requestConclusion = useCallback(async () => {
    if (geminiClientRef.current && store.sessionState === SessionState.ACTIVE) {
      console.log("[useVivaSession] User requested end. Prompting AI...");
      const accepted = geminiClientRef.current.sendText(
        "The user needs to leave now. Please immediately evaluate the session so far and call the conclude_viva tool with your feedback."
      );
      if (accepted) {
        setSessionState(SessionState.CONCLUDING);
        return;
      }
    }
    try {
      await abandonSession();
    } catch {
      // Keep the page available for a retry; expiry reconciliation is the fallback.
    }
  }, [store.sessionState, abandonSession, setSessionState]);

  // Toggle mute
  const toggleMute = useCallback(() => {
    store.toggleMute();
  }, [store]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cleanupResources();
    };
  }, [cleanupResources]);

  return {
    ...store,
    telemetry: voiceTelemetry,
    initializeSession,
    requestConclusion,
    toggleMute,
  };
}
