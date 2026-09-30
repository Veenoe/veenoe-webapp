import type { GeminiEvent, TranscriptSource } from './message-processor';

export interface AssembledTranscript {
    id: string;
    role: 'user' | 'assistant';
    source: 'input' | 'output';
    text: string;
    isFinal: boolean;
    completion: 'protocol' | 'local' | 'open';
}

type Stream = { active?: AssembledTranscript; preview?: string };

/**
 * Owns local transcript identity for one Live connection. Interim input is a
 * replaceable hypothesis; canonical input/output fragments append verbatim.
 * Gemini supplies no segment ID, so this cannot deduplicate arbitrary replay.
 */
export class TranscriptAssembler {
    private input: Stream = {};
    private output: Stream = {};
    constructor(
        private emit: (entry: AssembledTranscript) => void,
        private makeId: () => string = () => crypto.randomUUID(),
    ) { }

    reset(): void {
        this.input = {};
        this.output = {};
    }

    accept(event: Extract<GeminiEvent, { type: 'transcription' }>): void {
        const stream = event.source === 'output' ? this.output : this.input;
        if (event.source === 'interim_input') {
            if (event.text !== undefined) {
                stream.preview = event.text;
                if (!stream.active) stream.active = this.create('input');
                // A canonical delta, once received, owns the displayed text.
                if (
                    stream.active.source === 'input' &&
                    !stream.active.isFinal &&
                    !stream.active.text
                ) {
                    this.emit({ ...stream.active, text: event.text });
                }
            }
            return;
        }
        if (event.text !== undefined && event.text.length > 0) {
            if (!stream.active) stream.active = this.create(event.source);
            stream.active.text += event.text;
            stream.preview = undefined;
            this.emit({ ...stream.active });
        }
        if (event.finished === true && stream.active)
            this.finish(stream, 'protocol');
    }

    /** Turn completion closes output locally, never the independent student stream. */
    closeOutputTurn(): void {
        if (this.output.active) this.finish(this.output, 'local');
    }

    interruptOutput(): void {
        if (this.output.active) this.finish(this.output, 'local');
    }

    private create(source: TranscriptSource): AssembledTranscript {
        return {
            id: this.makeId(),
            role: source === 'output' ? 'assistant' : 'user',
            source: source === 'output' ? 'output' : 'input',
            text: '',
            isFinal: false,
            completion: 'open',
        };
    }

    private finish(stream: Stream, completion: 'protocol' | 'local'): void {
        const active = stream.active;
        if (!active) return;
        const text = active.text || stream.preview || '';
        if (text)
            this.emit({
                ...active,
                text,
                isFinal: completion === 'protocol',
                completion,
            });
        stream.active = undefined;
        stream.preview = undefined;
    }
}
