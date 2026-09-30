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
    onConclusionRejected?: () => void;
    onConclusionFailure?: () => void;
}

function conclusionValidationIssue(args: Record<string, unknown>, id?: string): string | null {
    if (!id) return 'call_id';
    if (typeof args.score !== 'number' || !Number.isInteger(args.score) || args.score < 0 || args.score > 10) return 'score';
    if (typeof args.summary !== 'string' || !args.summary.trim() || args.summary.length > 2000) return 'summary';
    for (const field of ['strong_points', 'areas_of_improvement']) {
        const values = args[field];
        if (!Array.isArray(values) || values.length > 5 || !values.every(
            (value) => typeof value === 'string' && value.trim().length > 0 && value.trim().length <= 600,
        )) return field;
    }
    if (args.next_steps !== undefined && (!Array.isArray(args.next_steps) || args.next_steps.length > 3 || !args.next_steps.every(
        (value) => typeof value === 'string' && value.trim().length > 0 && value.trim().length <= 600,
    ))) return 'next_steps';
    if (args.coverage_note != null && (typeof args.coverage_note !== 'string' || !args.coverage_note.trim() || args.coverage_note.trim().length > 600)) return 'coverage_note';
    return null;
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
    let conclusionStatus: 'idle' | 'saving' | 'saved' | 'failed' = 'idle';
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
            if (conclusionSessionId !== currentSessionId) {
                conclusionSessionId = currentSessionId;
                conclusionStatus = 'idle';
            }
            // Gemini may emit the tool again after an interruption. Only one
            // backend write should decide the feedback for a given session.
            if (conclusionStatus !== 'idle') return;
            const issue = conclusionValidationIssue(args, id);
            if (issue || !id) {
                const field = issue ?? 'call_id';
                // Only fixed field names are logged, never report contents.
                console.warn('[ToolHandler] Conclusion rejected:', field);
                deps.onConclusionRejected?.();
                if (deps.onConclusionFailure) {
                    conclusionStatus = 'failed';
                    setError('Could not save the session report. Please start a new session.');
                    deps.onConclusionFailure();
                } else {
                    setError('Invalid conclusion request from voice service.');
                }
                return;
            }
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
                    ...(args.next_steps !== undefined ? { next_steps: args.next_steps as string[] } : {}),
                    ...(args.coverage_note != null ? { coverage_note: args.coverage_note as string } : {}),
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
