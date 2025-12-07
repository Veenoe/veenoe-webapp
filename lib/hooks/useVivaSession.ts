"use client";

import { useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useVivaStore } from "@/lib/store/viva-store";
import { GeminiLiveClientSDK } from "@/lib/gemini/live-client-sdk";
import { AudioHandler } from "@/lib/gemini/audio-handler";
import { AudioPlayer } from "@/lib/gemini/audio-player";
import { SessionState, AudioState } from "@/types/viva";
import { concludeViva } from "@/lib/api/client";

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

  const geminiClientRef = useRef<GeminiLiveClientSDK | null>(null);
  const audioHandlerRef = useRef<AudioHandler | null>(null);
  const audioPlayerRef = useRef<AudioPlayer | null>(null);

  const isAudioPlayingRef = useRef(false);
  const isTurnCompleteRef = useRef(true);
  
  // New Ref: Tracks if we have received the conclude tool but are waiting for audio to finish
  const isConclusionPendingRef = useRef(false);
  
  const recordingSwitchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const scheduleSwitchToRecording = useCallback(() => {
    if (recordingSwitchTimeoutRef.current) clearTimeout(recordingSwitchTimeoutRef.current);
    
    // Only switch to recording if we aren't about to end
    if (isConclusionPendingRef.current) return;

    recordingSwitchTimeoutRef.current = setTimeout(() => {
      setAudioState(AudioState.RECORDING);
      recordingSwitchTimeoutRef.current = null;
    }, 500);
  }, [setAudioState]);

  const cancelSwitchToRecording = useCallback(() => {
    if (recordingSwitchTimeoutRef.current) {
      clearTimeout(recordingSwitchTimeoutRef.current);
      recordingSwitchTimeoutRef.current = null;
    }
  }, []);

  const cleanupResources = useCallback(() => {
    cancelSwitchToRecording();
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
  }, [cancelSwitchToRecording]);

  // Helper to finalize the session state (Show popup)
  const finishConclusion = useCallback(() => {
    console.log("[useVivaSession] Audio finished. Finalizing session...");
    cleanupResources();
    setSessionState(SessionState.COMPLETED);
    isConclusionPendingRef.current = false;
  }, [cleanupResources, setSessionState]);

  const handleToolCall = useCallback(
    async (toolName: string, args: Record<string, unknown>) => {
      console.log(`[useVivaSession] Handling tool call: ${toolName}`, args);
      const currentSessionId = useVivaStore.getState().sessionId;
      
      if (!currentSessionId) return;

      if (toolName === "conclude_viva") {
        try {
          console.log("[useVivaSession] AI requested conclusion. Saving results...");
          
          // 1. Save data to backend
          await concludeViva({
            viva_session_id: currentSessionId,
            score: (args.score as number) ?? 0,
            summary: (args.summary as string) ?? "",
            strong_points: (args.strong_points as string[]) ?? [],
            areas_of_improvement: (args.areas_of_improvement as string[]) ?? [],
          });

          // 2. Update Local Store for the Popup UI
          useVivaStore.getState().setConclusionData({
             score: (args.score as number) ?? 0,
             total: 10,
             feedback: (args.summary as string) ?? "",
          });

          // 3. DECISION POINT: Wait for audio or finish now?
          if (isAudioPlayingRef.current) {
              console.log("[useVivaSession] Audio is still playing. Waiting for it to finish before showing results.");
              isConclusionPendingRef.current = true;
              // We do NOT call cleanupResources() yet.
          } else {
              console.log("[useVivaSession] No audio playing. Finishing immediately.");
              finishConclusion();
          }
          
        } catch (error) {
          console.error("Failed to conclude session:", error);
          setError("Failed to save session results.");
          // In case of error, force finish to avoid getting stuck
          finishConclusion(); 
        }
      }
    },
    [setSessionState, setError, finishConclusion]
  );

  const _startAudioPipeline = useCallback(async () => {
    if (!audioHandlerRef.current || !geminiClientRef.current) return;

    try {
      setAudioState(AudioState.RECORDING);
      await audioHandlerRef.current.startRecording((audioData) => {
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

  const initializeSession = useCallback(async () => {
    const ephemeralToken = useVivaStore.getState().ephemeralToken;
    if (!ephemeralToken) return;

    try {
      setSessionState(SessionState.STARTING);
      // Reset flags on new session
      isConclusionPendingRef.current = false;

      audioHandlerRef.current = new AudioHandler();
      await audioHandlerRef.current.initialize();

      audioPlayerRef.current = new AudioPlayer({
        onPlayStart: () => {
          isAudioPlayingRef.current = true;
          setAudioState(AudioState.PLAYING);
          cancelSwitchToRecording();
        },
        onPlayEnd: () => {
          console.log("[useVivaSession] Audio Playback Ended");
          isAudioPlayingRef.current = false;

          // CRITICAL FIX: Check if we were waiting to conclude
          if (isConclusionPendingRef.current) {
              finishConclusion();
              return;
          }

          // Otherwise, normal turn logic
          if (isTurnCompleteRef.current) scheduleSwitchToRecording();
        },
      });
      await audioPlayerRef.current.initialize();

      geminiClientRef.current = new GeminiLiveClientSDK(ephemeralToken, {
        onConnected: () => {
          setSessionState(SessionState.ACTIVE);
          _startAudioPipeline();
        },
        onError: (e) => {
          setError(e.message);
          setSessionState(SessionState.ERROR);
        },
        onAudioData: async (base64) => {
          // If we are pending conclusion, we still allow final audio chunks to play
          isTurnCompleteRef.current = false;
          cancelSwitchToRecording();
          
          if (!isAudioPlayingRef.current) {
            isAudioPlayingRef.current = true;
            setAudioState(AudioState.PLAYING);
          }
          await audioPlayerRef.current?.playAudio(base64);
        },
        onTurnComplete: () => {
          isTurnCompleteRef.current = true;
          // Only switch to recording if we aren't concluding
          if (!isAudioPlayingRef.current && !isConclusionPendingRef.current) {
             scheduleSwitchToRecording();
          }
        },
        onInterrupted: () => {
          audioPlayerRef.current?.stop();
          cancelSwitchToRecording();
          isAudioPlayingRef.current = false;
          isTurnCompleteRef.current = true;
          setAudioState(AudioState.RECORDING);
        },
        onTranscript: (text, isFinal) => addTranscript({ role: "assistant", text, isFinal }),
        onToolCall: handleToolCall,
      });

      await geminiClientRef.current.connect();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Connection failed");
      setSessionState(SessionState.ERROR);
    }
  }, [setSessionState, setError, addTranscript, handleToolCall, _startAudioPipeline, scheduleSwitchToRecording, cancelSwitchToRecording, finishConclusion]);

  const requestConclusion = useCallback(() => {
    if (geminiClientRef.current && store.sessionState === SessionState.ACTIVE) {
        console.log("[useVivaSession] User requested end. Prompting AI for conclusion...");
        geminiClientRef.current.sendText("The user needs to leave now. Please immediately evaluate the session so far and call the conclude_viva tool with your feedback.");
        setSessionState(SessionState.CONCLUDING);
    } else {
        finishConclusion();
        router.push("/");
    }
  }, [store.sessionState, router, finishConclusion]);

  const toggleMute = useCallback(() => {
    store.toggleMute();
  }, [store]);

  useEffect(() => {
    return () => cleanupResources();
  }, [cleanupResources]);

  return {
    ...store,
    initializeSession,
    requestConclusion,
    toggleMute
  };
}