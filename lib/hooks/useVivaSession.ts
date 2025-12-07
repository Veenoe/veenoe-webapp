"use client";

import { useEffect, useRef, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useVivaStore } from "@/lib/store/viva-store";
import { GeminiLiveClientSDK } from "@/lib/gemini/live-client-sdk";
import { AudioRecorder } from "@/lib/gemini/audio-recorder";
import { AudioPlayer } from "@/lib/gemini/audio-player";
import { SessionState, AudioState } from "@/types/viva";
import { createToolHandler } from "./viva/tool-handlers";
import { createAudioPipeline } from "./viva/audio-pipeline";

export function useVivaSession() {
  const router = useRouter();
  const store = useVivaStore();

  const {
    sessionId,
    setSessionState,
    setError,
    addTranscript,
    setAudioState
  } = store;

  // Refs for managing resources
  const geminiClientRef = useRef<GeminiLiveClientSDK | null>(null);
  const audioHandlerRef = useRef<AudioRecorder | null>(null);
  const audioPlayerRef = useRef<AudioPlayer | null>(null);

  // State tracking refs
  const isAudioPlayingRef = useRef(false);
  const isTurnCompleteRef = useRef(true);
  const isConclusionPendingRef = useRef(false);

  // Cleanup all resources
  const cleanupResources = useCallback(() => {
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
  }, []);

  // Finalize session state (show popup)
  const finishConclusion = useCallback(() => {
    console.log("[useVivaSession] Finalizing session...");
    cleanupResources();
    setSessionState(SessionState.COMPLETED);
    isConclusionPendingRef.current = false;
  }, [cleanupResources, setSessionState]);

  // Create audio pipeline controller
  const audioPipeline = useMemo(() => createAudioPipeline({
    setAudioState,
    isConclusionPendingRef,
    isTurnCompleteRef,
    isAudioPlayingRef,
    finishConclusion,
  }), [setAudioState, finishConclusion]);

  // Create tool handler
  const handleToolCall = useMemo(() => createToolHandler({
    setError,
    finishConclusion,
    isAudioPlayingRef,
    isConclusionPendingRef,
  }), [setError, finishConclusion]);

  // Start audio pipeline
  const _startAudioPipeline = useCallback(async () => {
    if (!audioHandlerRef.current || !geminiClientRef.current) return;

    try {
      setAudioState(AudioState.RECORDING);
      await audioHandlerRef.current.startRecording((audioData: ArrayBuffer) => {
        const { isMuted, audioState } = useVivaStore.getState();
        if (geminiClientRef.current && !isMuted && audioState === AudioState.RECORDING) {
          geminiClientRef.current.sendAudio(audioData);
        }
      });
    } catch (error) {
      setError("Failed to start recording");
      setAudioState(AudioState.IDLE);
    }
  }, [setAudioState, setError]);

  // Initialize session
  const initializeSession = useCallback(async () => {
    const ephemeralToken = useVivaStore.getState().ephemeralToken;
    if (!ephemeralToken) return;

    try {
      setSessionState(SessionState.STARTING);
      isConclusionPendingRef.current = false;

      // Initialize audio recorder (handles microphone input)
      audioHandlerRef.current = new AudioRecorder();
      await audioHandlerRef.current.initialize();

      // Initialize audio player with pipeline callbacks
      audioPlayerRef.current = new AudioPlayer(audioPipeline.createPlaybackCallbacks());
      await audioPlayerRef.current.initialize();

      // Initialize Gemini client with event handlers
      // Get model from backend response and pass to SDK
      const googleModel = useVivaStore.getState().googleModel;
      geminiClientRef.current = new GeminiLiveClientSDK(
        ephemeralToken,
        {
          onConnected: () => {
            setSessionState(SessionState.ACTIVE);
            _startAudioPipeline();
          },
          onError: (e) => {
            setError(e.message);
            setSessionState(SessionState.ERROR);
          },
          onAudioData: async (base64) => {
            isTurnCompleteRef.current = false;
            audioPipeline.cancelSwitchToRecording();

            if (!isAudioPlayingRef.current) {
              isAudioPlayingRef.current = true;
              setAudioState(AudioState.PLAYING);
            }
            await audioPlayerRef.current?.playAudio(base64);
          },
          onTurnComplete: () => {
            isTurnCompleteRef.current = true;
            if (!isAudioPlayingRef.current && !isConclusionPendingRef.current) {
              audioPipeline.scheduleSwitchToRecording();
            }
          },
          onInterrupted: () => {
            audioPlayerRef.current?.stop();
            audioPipeline.cancelSwitchToRecording();
            isAudioPlayingRef.current = false;
            isTurnCompleteRef.current = true;
            setAudioState(AudioState.RECORDING);
          },
          onTranscript: (text, isFinal) => addTranscript({ role: "assistant", text, isFinal }),
          onToolCall: handleToolCall,
        },
        googleModel ?? undefined
      );

      await geminiClientRef.current.connect();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Connection failed");
      setSessionState(SessionState.ERROR);
    }
  }, [setSessionState, setError, addTranscript, handleToolCall, _startAudioPipeline, audioPipeline, setAudioState]);

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
      audioPipeline.cleanup();
      cleanupResources();
    };
  }, [audioPipeline, cleanupResources]);

  return {
    ...store,
    initializeSession,
    requestConclusion,
    toggleMute
  };
}