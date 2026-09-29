/** Saves Gemini tool results and coordinates final playback with session completion. */

import { useVivaStore } from "@/lib/store/viva-store";
import { concludeViva, setAuthToken } from "@/lib/api/axios";

// Debug utility - disabled in production
const debug = process.env.NODE_ENV !== 'production'
    ? (...args: unknown[]) => console.log('[ToolHandler]', ...args)
    : () => { };

export interface ToolHandlerDependencies {
    setError: (error: string | null) => void;
    finishConclusion: () => void;
    hasPendingPlayback: () => boolean;
    isConclusionPendingRef: React.MutableRefObject<boolean>;
    /** Function to get the current auth token - required for API calls */
    getToken: () => Promise<string | null>;
    /** Allows the conclusion side effect to be exercised without a backend in tests. */
    saveConclusion?: typeof concludeViva;
    abandonSession?: () => Promise<void>;
    isConclusionSavingRef?: React.MutableRefObject<boolean>;
}

/**
 * Creates a tool call handler with the provided dependencies
 */
export function createToolHandler(deps: ToolHandlerDependencies) {
    const { setError, finishConclusion, hasPendingPlayback, isConclusionPendingRef, getToken } = deps;
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
            if (deps.isConclusionSavingRef) deps.isConclusionSavingRef.current = true;
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
                if (deps.isConclusionSavingRef) deps.isConclusionSavingRef.current = false;
                if (conclusionSessionId === currentSessionId) conclusionStatus = 'saved';
                if (useVivaStore.getState().sessionId !== currentSessionId) return;

                // 2. Update Local Store for the Popup UI
                useVivaStore.getState().setConclusionData({
                    score: (args.score as number) ?? 0,
                    total: 10,
                    feedback: (args.summary as string) ?? "",
                });

                // The tool call is a turn boundary. Playback owns the authoritative
                // queue state, including audio that has not started rendering yet.
                if (hasPendingPlayback()) {
                    debug("Final audio is pending. Waiting for the playback drain.");
                    isConclusionPendingRef.current = true;
                } else {
                    debug("Final audio has drained. Finishing session.");
                    finishConclusion();
                }

            } catch (error) {
                if (deps.isConclusionSavingRef) deps.isConclusionSavingRef.current = false;
                if (conclusionSessionId === currentSessionId && conclusionStatus === 'saving') conclusionStatus = 'idle';
                if (useVivaStore.getState().sessionId !== currentSessionId) return;
                debug("Failed to conclude session:", error);
                setError("Failed to save session results.");
                await deps.abandonSession?.().catch(() => {});
            }
        }
    };
}

