/**
 * Tool Handlers for Viva Session
 * Handles AI tool calls (conclude_viva, future tools) - easily testable
 * 
 * Design Decisions (First Principles):
 * 1. Separation from main hook for testability
 * 2. Dependency injection for side effects
 * 3. Clear constants for timing-critical values
 */

import { useVivaStore } from "@/lib/store/viva-store";
import { concludeViva, setAuthToken } from "@/lib/api/axios";

// Debug utility - disabled in production
const debug = process.env.NODE_ENV !== 'production'
    ? (...args: unknown[]) => console.log('[ToolHandler]', ...args)
    : () => { };

// ---------------------------------------------------------------------------
// Configuration Constants
// ---------------------------------------------------------------------------

/**
 * Grace period (in milliseconds) to wait for audio buffer to fill before
 * checking if audio is playing. This ensures the AI's goodbye message
 * has time to start decoding and begin playback before we decide whether
 * to wait for it or finish immediately.
 * 
 * Why 300ms: Audio chunks are typically 100-200ms, and we need to account
 * for decode time, buffer scheduling, and OS audio subsystem latency.
 */
const AUDIO_BUFFER_GRACE_PERIOD_MS = 300;

export interface ToolHandlerDependencies {
    setError: (error: string | null) => void;
    finishConclusion: () => void;
    isAudioPlayingRef: React.MutableRefObject<boolean>;
    isConclusionPendingRef: React.MutableRefObject<boolean>;
    /** Function to get the current auth token - required for API calls */
    getToken: () => Promise<string | null>;
    /** Allows the conclusion side effect to be exercised without a backend in tests. */
    saveConclusion?: typeof concludeViva;
}

/**
 * Creates a tool call handler with the provided dependencies
 */
export function createToolHandler(deps: ToolHandlerDependencies) {
    const { setError, finishConclusion, isAudioPlayingRef, isConclusionPendingRef, getToken } = deps;
    const saveConclusion = deps.saveConclusion ?? concludeViva;
    let conclusionSessionId: string | null = null;
    let conclusionStatus: 'idle' | 'saving' | 'saved' = 'idle';

    return async function handleToolCall(
        toolName: string,
        args: Record<string, unknown>
    ): Promise<void> {
        debug(`Handling tool call: ${toolName}`, args);
        const currentSessionId = useVivaStore.getState().sessionId;

        if (!currentSessionId) return;

        if (toolName === "conclude_viva") {
            if (conclusionSessionId !== currentSessionId) {
                conclusionSessionId = currentSessionId;
                conclusionStatus = 'idle';
            }
            // Gemini may emit the tool again after an interruption. Only one
            // backend write should decide the feedback for a given session.
            if (conclusionStatus !== 'idle') return;
            conclusionStatus = 'saving';
            try {
                debug("AI requested conclusion. Saving results...");

                // Get fresh auth token before API call
                const token = await getToken();
                setAuthToken(token);

                // 1. Save data to backend
                await saveConclusion({
                    viva_session_id: currentSessionId,
                    score: (args.score as number) ?? 0,
                    summary: (args.summary as string) ?? "",
                    strong_points: (args.strong_points as string[]) ?? [],
                    areas_of_improvement: (args.areas_of_improvement as string[]) ?? [],
                });
                if (conclusionSessionId === currentSessionId) conclusionStatus = 'saved';
                if (useVivaStore.getState().sessionId !== currentSessionId) return;

                // 2. Update Local Store for the Popup UI
                useVivaStore.getState().setConclusionData({
                    score: (args.score as number) ?? 0,
                    total: 10,
                    feedback: (args.summary as string) ?? "",
                });

                // 3. DECISION POINT: Wait for audio or finish now?
                // The AI sends audio and tool call together, but audio takes time to decode/queue.
                await new Promise(resolve => setTimeout(resolve, AUDIO_BUFFER_GRACE_PERIOD_MS));
                if (useVivaStore.getState().sessionId !== currentSessionId) return;

                debug(`After ${AUDIO_BUFFER_GRACE_PERIOD_MS}ms delay - isAudioPlaying: ${isAudioPlayingRef.current}`);

                if (isAudioPlayingRef.current) {
                    debug("Audio is still playing. Waiting for it to finish.");
                    isConclusionPendingRef.current = true;
                } else {
                    debug("No audio playing. Finishing immediately.");
                    finishConclusion();
                }

            } catch (error) {
                if (conclusionSessionId === currentSessionId && conclusionStatus === 'saving') conclusionStatus = 'idle';
                if (useVivaStore.getState().sessionId !== currentSessionId) return;
                debug("Failed to conclude session:", error);
                setError("Failed to save session results.");
                // In case of error, force finish to avoid getting stuck
                finishConclusion();
            }
        }
    };
}

