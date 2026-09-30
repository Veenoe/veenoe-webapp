import type { GeminiEvent, TranscriptSource } from './message-processor';

export interface AssembledTranscript {
    id: string;
    role: 'user' | 'assistant';
    source: 'input' | 'output';
    text: string;
    isFinal: boolean;
    completion: 'protocol' | 'local' | 'open';
}

type OutputStream = { active?: AssembledTranscript };
type InputStream = {
    preview?: AssembledTranscript;
    pendingCanonical?: AssembledTranscript;
};

/**
 * Owns local transcript identity for one Live connection. Interim input is a
 * replaceable hypothesis. Canonical input messages have no documented delta or
 * utterance identity, so each message is preserved as a separate local segment.
 * Output fragments append within the model turn. Arbitrary replay cannot be
 * deduplicated without a server segment ID.
 */
export class TranscriptAssembler {
    private input: InputStream = {};
    private output: OutputStream = {};
    constructor(
        private emit: (entry: AssembledTranscript) => void,
        private makeId: () => string = () => crypto.randomUUID(),
    ) { }

    reset(): void {
        this.input = {};
        this.output = {};
    }

    accept(event: Extract<GeminiEvent, { type: 'transcription' }>): void {
        if (event.source === 'interim_input') {
            if (event.text !== undefined) {
                if (!this.input.preview) this.input.preview = this.create('input');
                this.input.preview = { ...this.input.preview, text: event.text };
                this.emit({ ...this.input.preview });
            }
            return;
        }
        if (event.source === 'input') {
            this.acceptInput(event);
            return;
        }
        const stream = this.output;
        if (event.text !== undefined && event.text.length > 0) {
            if (!stream.active) stream.active = this.create('output');
            stream.active.text += event.text;
            this.emit({ ...stream.active });
        }
        if (event.finished === true && stream.active)
            this.finish(stream, 'protocol');
    }

    private acceptInput(event: Extract<GeminiEvent, { type: 'transcription' }>): void {
        if (event.text !== undefined && event.text.length > 0) {
            // Replace a hypothesis with authoritative text. Without a wire ID
            // or a delta/snapshot contract, joining two canonical messages
            // could duplicate a correction or merge separate utterances.
            const entry = {
                ...(this.input.preview ?? this.create('input')),
                text: event.text,
            };
            this.input.preview = undefined;
            this.input.pendingCanonical = entry;
            this.emit({ ...entry });
        }
        if (event.finished === true && this.input.pendingCanonical) {
            this.emit({
                ...this.input.pendingCanonical,
                isFinal: true,
                completion: 'protocol',
            });
            this.input.pendingCanonical = undefined;
        }
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

    private finish(stream: OutputStream, completion: 'protocol' | 'local'): void {
        const active = stream.active;
        if (!active) return;
        const text = active.text;
        if (text)
            this.emit({
                ...active,
                text,
                isFinal: completion === 'protocol',
                completion,
            });
        stream.active = undefined;
    }
}
