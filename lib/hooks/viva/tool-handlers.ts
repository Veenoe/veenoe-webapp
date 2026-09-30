/** Saves Gemini tool results and coordinates final playback with session completion. */

import { useVivaStore } from '@/lib/store/viva-store';
import { concludeViva, setAuthToken } from '@/lib/api/axios';

// Debug utility - disabled in production
const debug =
    process.env.NODE_ENV !== 'production'
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
    onTerminalCallAccepted?: () => void;
}

/**
 * Creates a tool call handler with the provided dependencies
 */
export function createToolHandler(deps: ToolHandlerDependencies) {
    const {
        setError,
        finishConclusion,
        hasPendingPlayback,
        isConclusionPendingRef,
        getToken,
    } = deps;
    const saveConclusion = deps.saveConclusion ?? concludeViva;
    let conclusionSessionId: string | null = null;
    let conclusionStatus: 'idle' | 'saving' | 'saved' = 'idle';
    const cancelled = new Set<string>();
    let cancellationSessionId: string | null = null;
    const syncSession = () => {
        const sessionId = useVivaStore.getState().sessionId;
        if (sessionId !== cancellationSessionId) {
            cancelled.clear();
            cancellationSessionId = sessionId;
        }
        return sessionId;
    };

    // Cancellation is scoped to the current viva. Once saveConclusion begins,
    // the backend alone decides whether its terminal write committed.
    const cancel = (ids: string[]) => {
        syncSession();
        for (const id of ids) cancelled.add(id);
    };

    const handleToolCall = async (
        toolName: string,
        args: Record<string, unknown>,
        id?: string,
    ): Promise<void> => {
        const currentSessionId = syncSession();
        if (id && cancelled.has(id)) return;

        if (!currentSessionId) return;

        if (toolName === 'conclude_viva') {
            if (
                !id ||
                typeof args.score !== 'number' ||
                !Number.isFinite(args.score) ||
                typeof args.summary !== 'string' ||
                !Array.isArray(args.strong_points) ||
                !args.strong_points.every(
                    (value) => typeof value === 'string',
                ) ||
                !Array.isArray(args.areas_of_improvement) ||
                !args.areas_of_improvement.every(
                    (value) => typeof value === 'string',
                )
            ) {
                setError('Invalid conclusion request from voice service.');
                return;
            }
            if (conclusionSessionId !== currentSessionId) {
                conclusionSessionId = currentSessionId;
                conclusionStatus = 'idle';
            }
            // Gemini may emit the tool again after an interruption. Only one
            // backend write should decide the feedback for a given session.
            if (conclusionStatus !== 'idle') return;
            conclusionStatus = 'saving';
            if (deps.isConclusionSavingRef)
                deps.isConclusionSavingRef.current = true;
            try {
                debug('AI requested conclusion. Saving results...');

                // Get fresh auth token before API call
                const token = await getToken();
                if (
                    cancelled.has(id) ||
                    useVivaStore.getState().sessionId !== currentSessionId
                ) {
                    conclusionStatus = 'idle';
                    if (deps.isConclusionSavingRef)
                        deps.isConclusionSavingRef.current = false;
                    return;
                }
                setAuthToken(token);
                // This terminal tool is the final-audio boundary. No Gemini
                // function response is sent and no later turnComplete is needed.
                deps.onTerminalCallAccepted?.();

                // 1. Save data to backend
                await saveConclusion({
                    viva_session_id: currentSessionId,
                    score: args.score as number,
                    summary: args.summary as string,
                    strong_points: args.strong_points as string[],
                    areas_of_improvement: args.areas_of_improvement as string[],
                });
                if (deps.isConclusionSavingRef)
                    deps.isConclusionSavingRef.current = false;
                if (conclusionSessionId === currentSessionId)
                    conclusionStatus = 'saved';
                if (useVivaStore.getState().sessionId !== currentSessionId)
                    return;

                // 2. Update Local Store for the Popup UI
                useVivaStore.getState().setConclusionData({
                    score: args.score as number,
                    total: 10,
                    feedback: args.summary as string,
                });

                // The tool call is a turn boundary. Playback owns the authoritative
                // queue state, including audio that has not started rendering yet.
                if (hasPendingPlayback()) {
                    debug(
                        'Final audio is pending. Waiting for the playback drain.',
                    );
                    isConclusionPendingRef.current = true;
                } else {
                    debug('Final audio has drained. Finishing session.');
                    finishConclusion();
                }
            } catch {
                if (deps.isConclusionSavingRef)
                    deps.isConclusionSavingRef.current = false;
                if (
                    conclusionSessionId === currentSessionId &&
                    conclusionStatus === 'saving'
                )
                    conclusionStatus = 'idle';
                if (useVivaStore.getState().sessionId !== currentSessionId)
                    return;
                debug('Failed to conclude session');
                setError('Failed to save session results.');
                await deps.abandonSession?.().catch(() => { });
            }
        }
    };
    return Object.assign(handleToolCall, { cancel });
}
