/**
 * Gemini Message Processor
 * Parses and normalizes messages from Gemini Live API - testable without WebSocket
 */

export type MessageType =
    | 'setup_complete'
    | 'audio'
    | 'transcript'
    | 'tool_call'
    | 'turn_complete'
    | 'interrupted';

export interface ProcessedMessage {
    type: MessageType;
    payload: unknown;
}

export interface AudioPayload {
    data: string;
    mimeType: string;
}

export interface TranscriptPayload {
    text: string;
    isFinal: boolean;
}

export interface ToolCallPayload {
    name: string;
    args: Record<string, unknown>;
}

/**
 * Processes a raw Gemini API message and extracts structured events
 * @param message Raw message from Gemini Live API
 * @returns Array of processed messages (one raw message can contain multiple events)
 */
export function processGeminiMessage(message: unknown): ProcessedMessage[] {
    const results: ProcessedMessage[] = [];
    const msg = message as Record<string, unknown>;

    // Handle setup complete
    if (msg.setupComplete) {
        results.push({ type: 'setup_complete', payload: null });
    }

    // Handle server content (audio, text, turn signals)
    if (msg.serverContent) {
        const serverContent = msg.serverContent as Record<string, unknown>;

        // Check for interruption
        if (serverContent.interrupted) {
            results.push({ type: 'interrupted', payload: null });
        }

        // Process model turn parts
        const modelTurn = serverContent.modelTurn as Record<string, unknown> | undefined;
        if (modelTurn?.parts) {
            const parts = modelTurn.parts as Array<Record<string, unknown>>;

            for (const part of parts) {
                // Handle transcript text
                if (part.text) {
                    const transcriptPayload: TranscriptPayload = {
                        text: part.text as string,
                        isFinal: (serverContent.turnComplete as boolean) || false,
                    };
                    results.push({ type: 'transcript', payload: transcriptPayload });
                }

                // Handle audio data
                const inlineData = part.inlineData as Record<string, unknown> | undefined;
                if (inlineData?.data) {
                    const audioPayload: AudioPayload = {
                        data: inlineData.data as string,
                        mimeType: (inlineData.mimeType as string) || 'audio/pcm;rate=24000',
                    };
                    results.push({ type: 'audio', payload: audioPayload });
                }
            }
        }

        // Handle turn complete signal
        if (serverContent.turnComplete) {
            results.push({ type: 'turn_complete', payload: null });
        }
    }

    // Handle tool calls
    if (msg.toolCall) {
        const toolCall = msg.toolCall as Record<string, unknown>;
        const functionCalls = toolCall.functionCalls as Array<Record<string, unknown>> | undefined;

        if (functionCalls && functionCalls.length > 0) {
            for (const call of functionCalls) {
                const toolCallPayload: ToolCallPayload = {
                    name: call.name as string,
                    args: call.args as Record<string, unknown>,
                };
                results.push({ type: 'tool_call', payload: toolCallPayload });
            }
        }
    }

    return results;
}
