/**
 * Tool Handlers for Viva Session
 * Handles AI tool calls (conclude_viva, future tools) - easily testable
 */

import { useVivaStore } from "@/lib/store/viva-store";
import { concludeViva } from "@/lib/api/axios";

export interface ToolHandlerDependencies {
    setError: (error: string | null) => void;
    finishConclusion: () => void;
    isAudioPlayingRef: React.MutableRefObject<boolean>;
    isConclusionPendingRef: React.MutableRefObject<boolean>;
}

/**
 * Creates a tool call handler with the provided dependencies
 */
export function createToolHandler(deps: ToolHandlerDependencies) {
    const { setError, finishConclusion, isAudioPlayingRef, isConclusionPendingRef } = deps;

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
