/** Gemini Live PCM16 playback through one persistent audio-thread queue. */
export interface PlaybackBufferStats {
    receivedSamples: number;
    storedSamples: number;
    playedSamples: number;
    clearedSamples: number;
    rejectedSamples: number;
    waitingSilenceSamples: number;
}

export interface PlaybackBufferEvent {
    type: string;
    generation: number;
    chunkId?: number;
    samples?: number;
    queueDepthMs?: number;
    reason?: string;
    stats?: PlaybackBufferStats;
}

export interface AudioPlayerCallbacks {
    onPlayStart?: () => void;
    onPlayEnd?: () => void;
    onAudioScheduled?: (queueDurationMs: number) => void;
    onUnderrun?: () => void;
    onPlaybackError?: () => void;
    onBufferEvent?: (event: PlaybackBufferEvent) => void;
}

const OUTPUT_SAMPLE_RATE_HZ = 24000;
const MAX_IN_FLIGHT_BYTES = OUTPUT_SAMPLE_RATE_HZ * 2 * 4;

/** Owns the output AudioContext and serializes Gemini chunks into one worklet. */
export class AudioPlayer {
    private audioContext: AudioContext | null = null;
    private node: AudioWorkletNode | null = null;
    private setup: Promise<void> | null = null;
    private enqueueTail: Promise<void> = Promise.resolve();
    private generation = 0;
    private nextChunkId = 0;
    private pendingChunks = 0;
    private inFlightBytes = 0;
    private completionRequested = false;
    private isPlaying = false;
    private queueDepthMs = 0;
    private failed = false;
    private destroyed = false;

    constructor(private callbacks: AudioPlayerCallbacks = {}) {}

    async initialize(): Promise<void> {
        // A user gesture on first playback is needed for browser autoplay policies.
    }

    private async prepare(): Promise<void> {
        if (this.setup) return this.setup;
        this.setup = (async () => {
            const context = new AudioContext({ sampleRate: OUTPUT_SAMPLE_RATE_HZ });
            this.audioContext = context;
            try {
                if (context.sampleRate !== OUTPUT_SAMPLE_RATE_HZ) throw new Error('Unsupported playback sample rate');
                await context.audioWorklet.addModule('/audio-output-pipeline.js');
                await context.audioWorklet.addModule('/audio-output-worklet.js');
                if (this.destroyed) return;
                const node = new AudioWorkletNode(context, 'audio-output-processor', {
                    numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [1],
                });
                node.port.onmessage = ({ data }) => {
                    if (this.destroyed || data.generation !== this.generation) return;
                    this.callbacks.onBufferEvent?.(data);
                    if (typeof data.queueDepthMs === 'number') this.queueDepthMs = data.queueDepthMs;
                    switch (data.type) {
                        case 'started':
                            this.isPlaying = true;
                            this.callbacks.onPlayStart?.();
                            break;
                        case 'ended':
                            const wasPlaying = this.isPlaying;
                            this.isPlaying = false;
                            if (wasPlaying) this.callbacks.onPlayEnd?.();
                            break;
                        case 'underrun':
                            this.callbacks.onUnderrun?.();
                            break;
                        case 'depth':
                            this.inFlightBytes = Math.max(0, this.inFlightBytes - data.acceptedBytes);
                            this.callbacks.onAudioScheduled?.(data.queueDepthMs);
                            break;
                        case 'overflow':
                            this.failPlayback();
                            break;
                    }
                };
                node.connect(context.destination);
                node.onprocessorerror = () => this.failPlayback();
                this.node = node;
            } catch (error) {
                if (this.audioContext === context) this.audioContext = null;
                void context.close().catch(() => {});
                this.setup = null;
                throw error;
            }
        })();
        return this.setup;
    }

    playAudio(base64: string): Promise<void> {
        if (this.destroyed || this.failed) return Promise.resolve();
        const generation = this.generation;
        const chunkId = ++this.nextChunkId;
        this.pendingChunks++;
        // Concurrent SDK callbacks may await context setup or resume; preserve arrival order.
        const enqueue = this.enqueueTail.then(() => this.enqueueAudio(base64, generation, chunkId));
        this.enqueueTail = enqueue.catch(() => {});
        return enqueue;
    }

    private async enqueueAudio(base64: string, generation: number, chunkId: number): Promise<void> {
        try {
            await this.prepare();
            const context = this.audioContext;
            if (!context || generation !== this.generation || this.destroyed || this.failed) {
                this.callbacks.onBufferEvent?.({ type: 'stale_before_transfer', generation, chunkId });
                return;
            }
            if (context.state === 'suspended') await context.resume();
            if (generation !== this.generation || this.destroyed || this.failed || !this.node) {
                this.callbacks.onBufferEvent?.({ type: 'stale_before_transfer', generation, chunkId });
                return;
            }
            const binary = atob(base64);
            const pcm = new Uint8Array(binary.length);
            for (let i = 0; i < binary.length; i++) pcm[i] = binary.charCodeAt(i);
            // Limit chunks waiting in MessagePort as well as the worklet's ring buffer.
            if (this.inFlightBytes + pcm.byteLength > MAX_IN_FLIGHT_BYTES) {
                this.callbacks.onBufferEvent?.({ type: 'main_overflow', generation, chunkId, samples: pcm.byteLength / 2 });
                this.failPlayback();
                return;
            }
            this.inFlightBytes += pcm.byteLength;
            this.callbacks.onBufferEvent?.({ type: 'transferred', generation, chunkId, samples: pcm.byteLength / 2 });
            this.node.port.postMessage({ type: 'audio', generation, chunkId, buffer: pcm.buffer }, [pcm.buffer]);
        } catch {
            throw new Error('Audio playback could not be initialized');
        } finally {
            if (generation === this.generation) {
                this.pendingChunks--;
                this.flushCompletion();
            }
        }
    }

    /** Drain buffered PCM, then emit the normal playback-end callback once. */
    completeTurn(): void {
        if (this.destroyed || this.failed) return;
        this.completionRequested = true;
        this.flushCompletion();
    }

    /** Includes queued and in-flight audio that has not started rendering yet. */
    hasPendingAudio(): boolean {
        return !this.destroyed && (this.pendingChunks > 0 || this.inFlightBytes > 0 || this.queueDepthMs > 0 || this.isPlaying);
    }

    private failPlayback(): void {
        if (this.destroyed || this.failed) return;
        this.failed = true;
        this.stop('failure');
        this.callbacks.onPlaybackError?.();
    }

    private flushCompletion(): void {
        // The server's turnComplete may arrive before earlier async enqueues finish.
        if (this.completionRequested && this.pendingChunks === 0 && this.node) {
            this.node.port.postMessage({ type: 'complete', generation: this.generation });
            this.completionRequested = false;
        }
    }

    /** Discard the current response without reporting a normal playback end. */
    stop(reason = 'interruption'): void {
        // Worklet messages are ordered; generation also filters events already in transit.
        this.generation++;
        this.pendingChunks = 0;
        this.inFlightBytes = 0;
        this.queueDepthMs = 0;
        this.enqueueTail = Promise.resolve();
        this.completionRequested = false;
        this.isPlaying = false;
        this.callbacks.onBufferEvent?.({ type: 'clear_requested', generation: this.generation, reason });
        this.node?.port.postMessage({ type: 'clear', generation: this.generation, reason });
    }

    /** Release the persistent worklet and context; safe to call more than once. */
    cleanup(): void {
        if (this.destroyed) return;
        this.stop('cleanup');
        this.destroyed = true;
        if (this.node) {
            this.node.port.onmessage = null;
            this.node.port.close();
            this.node.disconnect();
            this.node = null;
        }
        const context = this.audioContext;
        this.audioContext = null;
        if (context) void context.close().catch(() => {});
    }
}
