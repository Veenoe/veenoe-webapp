"use client";

import { useEffect, useRef, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@clerk/nextjs";
import { useVivaStore } from "@/lib/store/viva-store";
import { GeminiLiveClientSDK } from "@/lib/gemini/live-client-sdk";
import { AudioRecorder } from "@/lib/gemini/audio-recorder";
import { AudioPlayer } from "@/lib/gemini/audio-player";
import {
  SessionState,
  MicrophoneState,
  ConversationState,
  PlaybackState,
} from "@/types/viva";
import { voiceTelemetry } from "@/lib/telemetry/voice-telemetry";
import { createToolHandler } from "./viva/tool-handlers";
import {
  createAudioPipeline,
  shouldForwardMicrophoneAudio,
} from "./viva/audio-pipeline";

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
  const interruptedResponseRef = useRef(false);

  // Cleanup all resources
  const cleanupResources = useCallback(() => {
    // Flag as intentional so normal teardown is not counted as an unexpected connection drop
    voiceTelemetry.setIntentionalDisconnect(true);
    voiceTelemetry.onSessionEnded();

    setMicrophoneState(MicrophoneState.IDLE);
    setPlaybackState(PlaybackState.IDLE);
    interruptedResponseRef.current = false;
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
    cleanupResources();
    setSessionState(SessionState.COMPLETED);
    isConclusionPendingRef.current = false;
  }, [cleanupResources, setSessionState]);

  // Create audio pipeline controller
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
  }), [setError, finishConclusion, getToken]);

  // Start audio pipeline
  const _startAudioPipeline = useCallback(async () => {
    if (!audioHandlerRef.current || !geminiClientRef.current) return;

    try {
      await audioHandlerRef.current.startRecording((audioData: ArrayBuffer) => {
        const { microphoneState } = useVivaStore.getState();
        if (geminiClientRef.current && shouldForwardMicrophoneAudio(microphoneState)) {
          voiceTelemetry.onMicrophonePacketSent(audioData.byteLength);
          geminiClientRef.current.sendAudio(audioData);
        }
      });
      setMicrophoneState(
        useVivaStore.getState().isMuted ? MicrophoneState.MUTED : MicrophoneState.ACTIVE
      );
      setConversationState(ConversationState.LISTENING);
    } catch {
      setError("Failed to start recording");
      setMicrophoneState(MicrophoneState.IDLE);
    }
  }, [setMicrophoneState, setConversationState, setError]);

  // Initialize session
  const initializeSession = useCallback(async () => {
    const ephemeralToken = useVivaStore.getState().ephemeralToken;
    if (!ephemeralToken) return;

    try {
      setSessionState(SessionState.STARTING);
      isConclusionPendingRef.current = false;

      const googleModel = useVivaStore.getState().googleModel;

      // Initialize fresh anonymous telemetry baseline
      voiceTelemetry.onSessionInitStart(googleModel ?? undefined);

      // Initialize audio recorder (handles microphone input)
      audioHandlerRef.current = new AudioRecorder();
      await audioHandlerRef.current.initialize();
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
            voiceTelemetry.onGeminiConnected();
            setSessionState(SessionState.ACTIVE);
            _startAudioPipeline();
          },
          onSetupComplete: () => {
            voiceTelemetry.onGeminiSetupComplete();
          },
          onDisconnected: () => {
            voiceTelemetry.onGeminiDisconnected();
          },
          onError: (e) => {
            voiceTelemetry.onGeminiError(e);
            setError(e.message);
            setSessionState(SessionState.ERROR);
          },
          onReconnectAttempt: (attempt) => {
            voiceTelemetry.onConnectionRetry(attempt);
          },
          onAudioData: async (base64) => {
            if (interruptedResponseRef.current || !audioPlayerRef.current) return;
            voiceTelemetry.onGeminiAudioChunkReceived();
            isTurnCompleteRef.current = false;
            setConversationState(ConversationState.SPEAKING);
            await audioPlayerRef.current.playAudio(base64);
          },
          onTurnComplete: () => {
            if (!interruptedResponseRef.current) {
              voiceTelemetry.onTurnComplete();
            }
            isTurnCompleteRef.current = true;
            interruptedResponseRef.current = false;
            if (!isAudioPlayingRef.current && !isConclusionPendingRef.current) {
              setConversationState(ConversationState.LISTENING);
            }
          },
          onInterrupted: () => {
            interruptedResponseRef.current = true;
            audioPipeline.interruptPlayback(
              () => audioPlayerRef.current?.stop(),
              () => voiceTelemetry.onInterruptionSignalReceived(),
              () => voiceTelemetry.onPlaybackStoppedDueToInterruption(),
            );
          },
          onTranscript: (text, isFinal) => addTranscript({ role: "assistant", text, isFinal }),
          onToolCall: handleToolCall,
        },
        googleModel ?? undefined
      );

      await geminiClientRef.current.connect();
    } catch (err) {
      voiceTelemetry.onGeminiError(err);
      setError(err instanceof Error ? err.message : "Connection failed");
      setSessionState(SessionState.ERROR);
    }
  }, [
    setSessionState,
    setError,
    addTranscript,
    handleToolCall,
    _startAudioPipeline,
    audioPipeline,
    setConversationState,
  ]);

  // Request conclusion from AI
  const requestConclusion = useCallback(() => {
    if (geminiClientRef.current && store.sessionState === SessionState.ACTIVE) {
      console.log("[useVivaSession] User requested end. Prompting AI...");
      geminiClientRef.current.sendText(
        "The user needs to leave now. Please immediately evaluate the session so far and call the conclude_viva tool with your feedback."
      );
      setSessionState(SessionState.CONCLUDING);
    } else {
      finishConclusion();
      router.push("/");
    }
  }, [store.sessionState, router, finishConclusion, setSessionState]);

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
