"use client";

import { useEffect, useRef, useCallback } from "react";
import { useVivaStore } from "@/lib/store/viva-store";
import { GeminiLiveClient } from "@/lib/gemini/live-client";
import { AudioHandler } from "@/lib/gemini/audio-handler";
import { SessionState, AudioState } from "@/types/viva";
import {
  getNextQuestion,
  evaluateResponse,
  concludeViva,
} from "@/lib/api/client";

export function useVivaSession() {
  const store = useVivaStore();
  
  const { 
    sessionId, 
    setSessionState, 
    setError, 
    addTranscript, 
    setCurrentQuestion, 
    setAudioState 
  } = store;

  const geminiClientRef = useRef<GeminiLiveClient | null>(null);
  const audioHandlerRef = useRef<AudioHandler | null>(null);

  /**
   * Handle tool calls from Gemini Live API
   */
  const handleToolCall = useCallback(
    async (toolName: string, args: Record<string, unknown>) => {
      try {
        const currentSessionId = useVivaStore.getState().sessionId;
        if (!currentSessionId) return;

        switch (toolName) {
          case "get_next_question": {
            const response = await getNextQuestion({
              viva_session_id: currentSessionId,
              topic: args.topic as string,
              class_level: args.class_level as number,
              current_difficulty: args.current_difficulty as number,
            });
            setCurrentQuestion(response);
            break;
          }

          case "evaluate_and_save_response": {
            await evaluateResponse({
              viva_session_id: currentSessionId,
              question_text: args.question_text as string,
              difficulty: args.difficulty as number,
              student_answer: args.student_answer as string,
              evaluation: args.evaluation as string,
              is_correct: args.is_correct as boolean,
            });
            break;
          }

          case "conclude_viva": {
            await concludeViva({
              viva_session_id: currentSessionId,
              final_feedback: args.final_feedback as string,
            });
            setSessionState(SessionState.COMPLETED);
            break;
          }
        }
      } catch (error) {
        console.error(`Tool call ${toolName} failed:`, error);
      }
    },
    [setCurrentQuestion, setSessionState]
  );

  /**
   * Start recording audio (Internal helper)
   * This is now called internally when connection is established
   */
  const _startAudioPipeline = useCallback(async () => {
    if (!audioHandlerRef.current || !geminiClientRef.current) return;

    try {
      setAudioState(AudioState.RECORDING);
      
      await audioHandlerRef.current.startRecording((audioData) => {
        const isMuted = useVivaStore.getState().isMuted;
        if (geminiClientRef.current && !isMuted) {
          geminiClientRef.current.sendAudio(audioData);
        }
      });
    } catch (error) {
      console.error("Failed to start recording:", error);
      setError("Failed to start recording");
      setAudioState(AudioState.IDLE);
    }
  }, [setAudioState, setError]);

  /**
   * Initialize the viva session with Gemini Live API
   */
  const initializeSession = useCallback(async () => {
    const currentToken = useVivaStore.getState().ephemeralToken;

    if (!currentToken) {
      setError("No ephemeral token available");
      return;
    }

    try {
      setSessionState(SessionState.STARTING);

      // 1. Initialize Audio Handler first
      audioHandlerRef.current = new AudioHandler();
      await audioHandlerRef.current.initialize();

      // 2. Initialize Gemini Client
      geminiClientRef.current = new GeminiLiveClient(currentToken, {
        onConnected: () => {
          console.log("Connected to Gemini Live API");
          setSessionState(SessionState.ACTIVE);
          
          // 3. START RECORDING ONLY WHEN CONNECTED
          _startAudioPipeline();
        },
        onDisconnected: () => {
          console.log("Disconnected from Gemini Live API");
        },
        onError: (error) => {
          console.error("Gemini Live API error:", error);
          setError(error.message);
          setSessionState(SessionState.ERROR);
        },
        onAudioData: async (audioData) => {
          if (audioHandlerRef.current) {
            await audioHandlerRef.current.playAudio(audioData);
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

      // 4. Initiate Connection
      await geminiClientRef.current.connect();
      
    } catch (error) {
      console.error("Failed to initialize session:", error);
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
    if (geminiClientRef.current) {
      geminiClientRef.current.disconnect();
      geminiClientRef.current = null;
    }

    if (audioHandlerRef.current) {
      audioHandlerRef.current.cleanup();
      audioHandlerRef.current = null;
    }

    setSessionState(SessionState.IDLE);
  }, [setSessionState]);

  /**
   * Manual Start Recording (for UI buttons if needed later)
   */
  const startRecording = useCallback(async () => {
     // If we are already connected, we can start recording manually
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
  };
}