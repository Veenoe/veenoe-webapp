"use client";

import { useEffect, useRef, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@clerk/nextjs";
import { useVivaStore } from "@/lib/store/viva-store";
import { GeminiLiveClientSDK } from "@/lib/gemini/live-client-sdk";
import { TranscriptAssembler } from "@/lib/gemini/transcript-assembler";
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
import {
  applyAbandonOutcome,
  endSessionForMicrophoneFailure,
} from "./viva/session-lifecycle";

export function useVivaSession() {
  const router = useRouter();
  const { getToken } = useAuth();
  const store = useVivaStore();

  const {
    setSessionState,
    setError,
    upsertTranscript,
    setMicrophoneState,
    setConversationState,
    setPlaybackState,
  } = store;

  // Refs for managing resources
  const geminiClientRef = useRef<GeminiLiveClientSDK | null>(null);
  const audioHandlerRef = useRef<AudioRecorder | null>(null);
  const audioPlayerRef = useRef<AudioPlayer | null>(null);
  const transcripts = useMemo(
    () => new TranscriptAssembler((entry) => upsertTranscript(entry)),
    [upsertTranscript],
  );

  // State tracking refs
  const isAudioPlayingRef = useRef(false);
  const isTurnCompleteRef = useRef(true);
  const isConclusionPendingRef = useRef(false);
  const isConclusionSavingRef = useRef(false);
  const abandonmentRef = useRef<Promise<void> | null>(null);
  const fatalMicrophoneHandledRef = useRef(false);
  const fatalPlaybackHandledRef = useRef(false);

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
    transcripts.reset();
    if (audioHandlerRef.current) {
      audioHandlerRef.current.cleanup();
      audioHandlerRef.current = null;
    }
    if (audioPlayerRef.current) {
      audioPlayerRef.current.cleanup();
      audioPlayerRef.current = null;
    }
  }, [setMicrophoneState, setPlaybackState, transcripts]);

  // Finalize session state (show popup)
  const finishConclusion = useCallback(() => {
    console.log("[useVivaSession] Finalizing session...");
    setSessionState(SessionState.COMPLETED);
    cleanupResources();
    isConclusionPendingRef.current = false;
  }, [cleanupResources, setSessionState]);

  const abandonSession = useCallback(
    (preserveError = false) => {
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
            if (!preserveError && !fatalMicrophoneHandledRef.current) {
              setError("Could not end the session. Please try again.");
            }
            setSessionState(SessionState.ERROR);
          }
          throw new Error("Session abandonment failed");
        })
        .finally(() => {
          abandonmentRef.current = null;
        });
      abandonmentRef.current = pending;
      return pending;
    },
    [cleanupResources, router, setError, setSessionState],
  );

  const handleFatalMicrophoneError = useCallback(
    (error: MicrophoneError) => {
      endSessionForMicrophoneFailure(error, fatalMicrophoneHandledRef, {
        recordError: (code) => voiceTelemetry.onMicrophoneError(code),
        setError,
        setSessionState,
        cleanupResources,
        abandonSession: () => abandonSession(true),
      });
    },
    [abandonSession, cleanupResources, setError, setSessionState],
  );

  const handleFatalPlaybackError = useCallback(() => {
    if (fatalPlaybackHandledRef.current) return;
    fatalPlaybackHandledRef.current = true;
    setError("Audio playback could not continue. Please try again.");
    setSessionState(SessionState.ERROR);
    cleanupResources();
    void abandonSession(true).catch(() => { });
  }, [abandonSession, cleanupResources, setError, setSessionState]);

  // Create audio pipeline controller
  // Existing controller factory retains refs; it does not read their values during render.
  const audioPipeline = useMemo(
    () =>
      createAudioPipeline({
        setConversationState,
        setPlaybackState,
        isConclusionPendingRef,
        isTurnCompleteRef,
        isAudioPlayingRef,
        finishConclusion,
      }),
    [setConversationState, setPlaybackState, finishConclusion],
  );

  // Create tool handler (with auth token getter for API calls)
  const handleToolCall = useMemo(
    () =>
      createToolHandler({
        setError,
        finishConclusion,
        hasPendingPlayback: () =>
          audioPlayerRef.current?.hasPendingAudio() ?? false,
        isConclusionPendingRef,
        getToken,
        abandonSession,
        isConclusionSavingRef,
        onTerminalCallAccepted: () => audioPlayerRef.current?.completeTurn(),
        onConclusionRejected: () => {
          // The rejected call still ends the spoken response; no turnComplete is promised.
          audioPipeline.completeTurn(() => audioPlayerRef.current?.completeTurn());
        },
        onConclusionFailure: () => {
          setSessionState(SessionState.ERROR);
          setConversationState(ConversationState.LISTENING);
          cleanupResources();
          void abandonSession(true).catch(() => { });
        },
      }),
    [setError, finishConclusion, getToken, abandonSession, audioPipeline, setConversationState, setSessionState, cleanupResources],
  );

  // Start audio pipeline
  const _startAudioPipeline = useCallback(async () => {
    if (!audioHandlerRef.current || !geminiClientRef.current) return;

    try {
      const inputState = () => {
        const { microphoneState, playbackState } = useVivaStore.getState();
        return { microphoneState, playbackState };
      };
      await audioHandlerRef.current.startRecording(
        (audioData, timing) => {
          const client = geminiClientRef.current;
          const { microphoneState, isMuted } = useVivaStore.getState();
          let sendFailed = false;
          audioPipeline.forwardMicrophoneAudio(
            audioData,
            microphoneState,
            isMuted,
            (data) =>
              client?.sendAudio(data, () => {
                sendFailed = true;
              }) ?? false,
            (byteLength) => voiceTelemetry.onMicrophonePacketSent(byteLength),
            () =>
              voiceTelemetry.onMicrophoneDrop(
                sendFailed ? "send_failure" : "transport_unready",
                1,
                inputState(),
                timing.sequence,
              ),
            (reason) => voiceTelemetry.onMicrophoneForwardingPaused(reason),
          );
        },
        (count, reason, sequence) =>
          voiceTelemetry.onMicrophoneDrop(
            reason,
            count,
            inputState(),
            sequence,
          ),
        (format) => voiceTelemetry.onMicrophoneFormat(format),
        (level) => voiceTelemetry.onMicrophoneLevel(level),
        (timing) => voiceTelemetry.onMicrophonePacketObserved(timing),
      );
      if (fatalMicrophoneHandledRef.current) return;
      setMicrophoneState(MicrophoneState.ACTIVE);
      setConversationState(ConversationState.LISTENING);
    } catch (error) {
      handleFatalMicrophoneError(
        error instanceof MicrophoneError
          ? error
          : new MicrophoneError("processing"),
      );
    }
  }, [
    audioPipeline,
    setMicrophoneState,
    setConversationState,
    handleFatalMicrophoneError,
  ]);

  // Initialize session
  const initializeSession = useCallback(async () => {
    const ephemeralToken = useVivaStore.getState().ephemeralToken;
    if (!ephemeralToken) return;

    try {
      setSessionState(SessionState.STARTING);
      fatalMicrophoneHandledRef.current = false;
      fatalPlaybackHandledRef.current = false;
      isConclusionPendingRef.current = false;
      audioPipeline.reset();
      transcripts.reset();

      const googleModel = useVivaStore.getState().googleModel;
      const vadProfile = useVivaStore.getState().vadProfile;

      // Initialize fresh anonymous telemetry baseline
      voiceTelemetry.onSessionInitStart(
        googleModel ?? undefined,
        vadProfile ?? undefined,
      );

      // Initialize audio recorder (handles microphone input)
      audioHandlerRef.current = new AudioRecorder();
      await audioHandlerRef.current.initialize(() => {
        handleFatalMicrophoneError(new MicrophoneError("ended"));
      });
      if (fatalMicrophoneHandledRef.current) return;
      const microphoneDiagnostics =
        audioHandlerRef.current.getMicrophoneDiagnostics();
      if (!microphoneDiagnostics) throw new MicrophoneError("ended");
      voiceTelemetry.onMicrophoneDiagnostics(microphoneDiagnostics);
      voiceTelemetry.onMicrophoneReady();

      // Initialize audio player with pipeline callbacks and telemetry hooks
      audioPlayerRef.current = new AudioPlayer(
        audioPipeline.createPlaybackCallbacks({
          onPlayStart: () => voiceTelemetry.onPlaybackStarted(),
          onPlayEnd: () => voiceTelemetry.onPlaybackEnded(),
          onAudioScheduled: (queueDurationMs) =>
            voiceTelemetry.onAudioScheduled(queueDurationMs),
          onUnderrun: () => voiceTelemetry.onPlaybackUnderrun(),
          onBufferEvent: (event) => voiceTelemetry.onPlaybackBufferEvent(event),
          onPlaybackError: handleFatalPlaybackError,
        }),
      );
      await audioPlayerRef.current.initialize();
      if (fatalMicrophoneHandledRef.current) return;
      voiceTelemetry.onAudioPlayerReady();

      let sessionReady = false;
      let setupReady = false;
      let microphoneStarted = false;
      const startMicrophoneWhenReady = () => {
        if (
          !sessionReady ||
          !setupReady ||
          microphoneStarted ||
          fatalMicrophoneHandledRef.current
        )
          return;
        if (geminiClientRef.current?.getConnectionState() !== "connected")
          return;
        microphoneStarted = true;
        setSessionState(SessionState.ACTIVE);
        void _startAudioPipeline();
      };

      // The SDK's socket-open callback can precede its usable Live session.
      const client = new GeminiLiveClientSDK(
        ephemeralToken,
        {
          onEvent: (event) => {
            if (geminiClientRef.current !== client) return;
            switch (event.type) {
              case "transcription":
                transcripts.accept(event);
                break;
              case "generation_complete":
                break; // Generation does not own playback or turn closure.
              case "interrupted":
                transcripts.interruptOutput();
                break;
              case "turn_complete":
                transcripts.closeOutputTurn();
                break;
              case "tool_call":
                // This terminal tool saves, drains audio, then closes without a Gemini response.
                queueMicrotask(() => {
                  if (geminiClientRef.current === client)
                    void handleToolCall(event.name, event.args, event.id);
                });
                break;
              case "tool_call_cancellation":
                handleToolCall.cancel(event.ids);
                break;
              case "go_away":
                break; // Notice of future closure; not an abandonment signal.
              case "resumption_update":
                break; // Exposed by adapter; VEENOE-23 owns resume.
              case "protocol_issue":
                console.warn("[Viva] Invalid Live field:", event.field);
                break;
            }
          },
          onConnected: () => {
            if (!audioHandlerRef.current?.getMicrophoneDiagnostics()) return;
            voiceTelemetry.onGeminiConnected();
          },
          onSetupComplete: () => {
            voiceTelemetry.onGeminiSetupComplete();
            setupReady = true;
            startMicrophoneWhenReady();
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
              void abandonSession().catch(() => { });
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
              void abandonSession().catch(() => { });
            }
          },
          onReconnectAttempt: (attempt) => {
            voiceTelemetry.onConnectionRetry(attempt);
          },
          onAudioData: async (base64) => {
            const player = audioPlayerRef.current;
            if (!player) return;
            try {
              await audioPipeline.receiveGeminiAudio(
                base64,
                (audio) => player.playAudio(audio),
                () => voiceTelemetry.onGeminiAudioChunkReceived(),
              );
            } catch {
              handleFatalPlaybackError();
            }
          },
          onTurnComplete: () => {
            audioPipeline.completeTurn(() => {
              audioPlayerRef.current?.completeTurn();
              voiceTelemetry.onTurnComplete();
            });
          },
          onInterrupted: () => {
            audioPipeline.interruptPlayback(
              () => audioPlayerRef.current?.stop(),
              () => voiceTelemetry.onInterruptionSignalReceived(),
              () => voiceTelemetry.onInterruptionClearRequested(),
              () => voiceTelemetry.onInterruptionWithoutPlayback(),
            );
          },
        },
        googleModel ?? undefined,
      );
      geminiClientRef.current = client;

      if (!audioHandlerRef.current?.getMicrophoneDiagnostics())
        throw new MicrophoneError("ended");
      await geminiClientRef.current.connect();
      sessionReady = true;
      startMicrophoneWhenReady();
    } catch (err) {
      if (fatalMicrophoneHandledRef.current) return;
      if (err instanceof MicrophoneError) {
        handleFatalMicrophoneError(err);
        return;
      } else {
        voiceTelemetry.onGeminiError(err);
        setError(err instanceof Error ? err.message : "Connection failed");
      }
      setSessionState(SessionState.ERROR);
      void abandonSession().catch(() => { });
    }
  }, [
    setSessionState,
    setError,
    transcripts,
    handleToolCall,
    _startAudioPipeline,
    audioPipeline,
    abandonSession,
    handleFatalMicrophoneError,
    handleFatalPlaybackError,
  ]);

  // Request conclusion from AI
  const requestConclusion = useCallback(async () => {
    const current = useVivaStore.getState();
    if (
      current.sessionState === SessionState.CONCLUDING ||
      isConclusionSavingRef.current || current.conclusionData
    ) return;
    if (geminiClientRef.current && current.sessionState === SessionState.ACTIVE) {
      console.log("[useVivaSession] User requested end. Prompting AI...");
      const accepted = geminiClientRef.current.sendText(
        "The session must end now. First speak a brief, warm thank-you and goodbye in the current language (English unless the student explicitly requested Hindi). Then call the existing conclude_viva tool once with the report based on this session. Do not ask another question or generate a second report.",
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
  }, [abandonSession, setSessionState]);

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
