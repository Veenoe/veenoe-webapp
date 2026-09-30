import type { LiveServerMessage } from '@google/genai';

export type TranscriptSource = 'input' | 'interim_input' | 'output';
/** Facts consumed by the app. Only this adapter interprets Google wire shapes. */
export type GeminiEvent =
    | { type: 'setup_complete' }
    | {
        type: 'transcription';
        source: TranscriptSource;
        text?: string;
        finished?: boolean;
    }
    | { type: 'audio'; data: string; mimeType: string }
    | { type: 'generation_complete' }
    | { type: 'turn_complete' }
    | { type: 'interrupted' }
    | {
        type: 'tool_call';
        id?: string;
        name: string;
        args: Record<string, unknown>;
    }
    | { type: 'tool_call_cancellation'; ids: string[] }
    | { type: 'go_away'; timeLeft?: string }
    | {
        type: 'resumption_update';
        resumable?: boolean;
        newHandle?: string;
        lastConsumedClientMessageIndex?: string;
    }
    | { type: 'protocol_issue'; field: string };

const object = (value: unknown): value is Record<string, unknown> =>
    value !== null && typeof value === 'object' && !Array.isArray(value);

/**
 * Emit every usable fact in one server envelope. Runtime guards protect the
 * externally supplied fields we dereference; an invalid sibling is diagnostic
 * data, not a reason to lose a valid transcript or lifecycle signal.
 */
export function processGeminiMessage(
    message: LiveServerMessage | unknown,
): GeminiEvent[] {
    if (!object(message)) return [{ type: 'protocol_issue', field: 'message' }];
    const events: GeminiEvent[] = [];
    const issue = (field: string) =>
        events.push({ type: 'protocol_issue', field });
    if (message.setupComplete !== undefined) {
        if (object(message.setupComplete))
            events.push({ type: 'setup_complete' });
        else issue('setupComplete');
    }
    const content = message.serverContent;
    if (content !== undefined) {
        if (!object(content)) issue('serverContent');
        else {
            // Clear the old response before dispatching any other fact. Its
            // co-located student transcription still belongs to the new input.
            const interrupted = content.interrupted === true;
            if (interrupted) events.push({ type: 'interrupted' });
            for (const [field, source] of [
                ['inputTranscription', 'input'],
                ['interimInputTranscription', 'interim_input'],
                ['outputTranscription', 'output'],
            ] as const) {
                const value = content[field];
                if (value === undefined) continue;
                if (
                    !object(value) ||
                    (value.text !== undefined &&
                        typeof value.text !== 'string') ||
                    (value.finished !== undefined &&
                        typeof value.finished !== 'boolean')
                ) {
                    issue(field);
                    continue;
                }
                events.push({
                    type: 'transcription',
                    source,
                    text: value.text as string | undefined,
                    finished: value.finished as boolean | undefined,
                });
            }
            // The existing player accepts 24 kHz PCM. Model text (including
            // thoughts) is intentionally not a caption source for AUDIO mode.
            if (!interrupted && content.modelTurn !== undefined) {
                if (
                    !object(content.modelTurn) ||
                    !Array.isArray(content.modelTurn.parts)
                )
                    issue('modelTurn.parts');
                else
                    for (const part of content.modelTurn.parts) {
                        if (!object(part)) {
                            issue('modelTurn.part');
                            continue;
                        }
                        const inline = part.inlineData;
                        if (inline === undefined) continue;
                        if (
                            !object(inline) ||
                            typeof inline.data !== 'string' ||
                            typeof inline.mimeType !== 'string' ||
                            !/^audio\/pcm;rate=24000$/i.test(inline.mimeType)
                        ) {
                            issue('modelTurn.inlineData');
                            continue;
                        }
                        events.push({
                            type: 'audio',
                            data: inline.data,
                            mimeType: inline.mimeType,
                        });
                    }
            }
            if (content.generationComplete === true)
                events.push({ type: 'generation_complete' });
            if (content.turnComplete === true)
                events.push({ type: 'turn_complete' });
        }
    }
    if (message.toolCall !== undefined) {
        if (
            !object(message.toolCall) ||
            !Array.isArray(message.toolCall.functionCalls)
        )
            issue('toolCall.functionCalls');
        else
            for (const call of message.toolCall.functionCalls) {
                if (
                    !object(call) ||
                    typeof call.name !== 'string' ||
                    !object(call.args) ||
                    (call.id !== undefined && typeof call.id !== 'string')
                ) {
                    issue('toolCall.functionCall');
                    continue;
                }
                events.push({
                    type: 'tool_call',
                    name: call.name,
                    id: call.id as string | undefined,
                    args: call.args,
                });
            }
    }
    if (message.toolCallCancellation !== undefined) {
        const value = message.toolCallCancellation;
        if (!object(value) || !Array.isArray(value.ids))
            issue('toolCallCancellation.ids');
        else {
            const ids = value.ids.filter(
                (id): id is string => typeof id === 'string',
            );
            if (ids.length !== value.ids.length)
                issue('toolCallCancellation.ids');
            events.push({ type: 'tool_call_cancellation', ids });
        }
    }
    if (message.goAway !== undefined) {
        const value = message.goAway;
        if (
            !object(value) ||
            (value.timeLeft !== undefined && typeof value.timeLeft !== 'string')
        )
            issue('goAway');
        else
            events.push({
                type: 'go_away',
                timeLeft: value.timeLeft as string | undefined,
            });
    }
    if (message.sessionResumptionUpdate !== undefined) {
        const value = message.sessionResumptionUpdate;
        if (
            !object(value) ||
            (value.resumable !== undefined &&
                typeof value.resumable !== 'boolean') ||
            (value.newHandle !== undefined &&
                typeof value.newHandle !== 'string') ||
            (value.lastConsumedClientMessageIndex !== undefined &&
                typeof value.lastConsumedClientMessageIndex !== 'string')
        )
            issue('sessionResumptionUpdate');
        else
            events.push({
                type: 'resumption_update',
                resumable: value.resumable as boolean | undefined,
                newHandle: value.newHandle as string | undefined,
                lastConsumedClientMessageIndex:
                    value.lastConsumedClientMessageIndex as string | undefined,
            });
    }
    return events;
}
