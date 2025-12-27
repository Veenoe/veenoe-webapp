/**
 * Tool Handlers for Viva Session
 * Handles AI tool calls (conclude_viva, future tools) - easily testable
 */

import { useVivaStore } from "@/lib/store/viva-store";
import { concludeViva, setAuthToken } from "@/lib/api/axios";

export interface ToolHandlerDependencies {
    setError: (error: string | null) => void;
    finishConclusion: () => void;
    isAudioPlayingRef: React.MutableRefObject<boolean>;
    isConclusionPendingRef: React.MutableRefObject<boolean>;
    /** Function to get the current auth token - required for API calls */
    getToken: () => Promise<string | null>;
}

/**
 * Creates a tool call handler with the provided dependencies
 */
export function createToolHandler(deps: ToolHandlerDependencies) {
    const { setError, finishConclusion, isAudioPlayingRef, isConclusionPendingRef, getToken } = deps;

    return async function handleToolCall(
        toolName: string,
        args: Record<string, unknown>
    ): Promise<void> {
        console.log(`[ToolHandler] Handling tool call: ${toolName}`, args);
        const currentSessionId = useVivaStore.getState().sessionId;

        if (!currentSessionId) return;

        if (toolName === "conclude_viva") {
            try {
                console.log("[ToolHandler] AI requested conclusion. Saving results...");

                // Get fresh auth token before API call
                const token = await getToken();
                setAuthToken(token);

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
                // The AI sends audio and tool call together, but audio takes time to decode/queue.
                // Wait 300ms to give audio a chance to start playing before checking state.
                // This ensures the AI's goodbye message plays before showing results.
                await new Promise(resolve => setTimeout(resolve, 300));

                console.log(`[ToolHandler] After 300ms delay - isAudioPlaying: ${isAudioPlayingRef.current}`);

                if (isAudioPlayingRef.current) {
                    console.log("[ToolHandler] Audio is still playing. Waiting for it to finish.");
                    isConclusionPendingRef.current = true;
                } else {
                    console.log("[ToolHandler] No audio playing. Finishing immediately.");
                    finishConclusion();
                }

            } catch (error) {
                console.error("[ToolHandler] Failed to conclude session:", error);
                setError("Failed to save session results.");
                // In case of error, force finish to avoid getting stuck
                finishConclusion();
            }
        }
    };
}
