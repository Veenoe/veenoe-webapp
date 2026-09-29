/** Gemini Live PCM16 playback through one persistent audio-thread queue. */
export interface PlaybackBufferStats {
    receivedSamples: number;
    storedSamples: number;
    playedSamples: number;
    clearedSamples: number;
    rejectedSamples: number;
    waitingSilenceSamples: number;
}

export type PlaybackBufferEventType = 'pending' | 'transferred' | 'accepted' | 'rejected' |
    'stale' | 'started' | 'ended' | 'underrun' | 'stats' | 'overflow' | 'cleared' |
    'clear_requested' | 'main_overflow';

export interface PlaybackBufferEvent {
    type: PlaybackBufferEventType;
    generation: number;
    chunkId?: number;
    samples?: number;
    queueDepthMs?: number;
    pendingEncodedBytes?: number;
    inFlightBytes?: number;
    clearAcknowledgmentMs?: number;
    reason?: string;
    stats?: PlaybackBufferStats;
    admissionToTransferMs?: number;
    capacityWaitMs?: number;
    conversionTransferMs?: number;
    setupWaitMs?: number;
    resumeWaitMs?: number;
    admissionToFirstRenderMs?: number;
}

type Command =
    | { type: 'audio'; generation: number; chunkId: number; buffer: ArrayBuffer }
    | { type: 'complete'; generation: number }
    | { type: 'clear'; generation: number; reason: string };

type WorkletEvent =
    | (PlaybackBufferEvent & { type: 'accepted' | 'rejected' | 'stale' | 'overflow'; chunkId: number })
    | (PlaybackBufferEvent & { type: 'started' | 'ended' | 'underrun' | 'stats' | 'cleared' });

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
const MAX_PENDING_ENCODED_BYTES = Math.ceil(MAX_IN_FLIGHT_BYTES * 4 / 3);
const WORKLET_EVENT_TYPES = new Set<PlaybackBufferEventType>([
    'accepted', 'rejected', 'stale', 'started', 'ended', 'underrun',
    'stats', 'overflow', 'cleared',
]);

interface PendingChunk {
    base64: string;
    generation: number;
    chunkId: number;
    encodedBytes: number;
    resolve: () => void;
    admittedAtMs: number;
    capacityWaitStartedAtMs?: number;
}

/** Owns browser resources, pending encoded audio, and transport reservations. */
export class AudioPlayer {
    private audioContext: AudioContext | null = null;
    private node: AudioWorkletNode | null = null;
    private setup: Promise<void> | null = null;
    private pending: PendingChunk[] = [];
    private draining = false;
    private pendingEncodedBytes = 0;
    private inFlight = new Map<number, { generation: number; bytes: number }>();
    private inFlightBytes = 0;
    private generation = 0;
    private nextChunkId = 0;
    private completionRequested = false;
    private isPlaying = false;
    private queueDepthMs = 0;
    private failed = false;
    private destroyed = false;
    private clearRequestedAt = new Map<number, number>();
    private firstAdmissionAtMs: number | null = null;

    constructor(private callbacks: AudioPlayerCallbacks = {}) {}

    async initialize(): Promise<void> {
        // Browser autoplay policy requires a gesture before the first resume.
    }

    private notify(event: PlaybackBufferEvent): void {
        try { this.callbacks.onBufferEvent?.(event); }
        catch (error) { console.error('[AudioPlayer] Diagnostic observer failed', error); }
    }

    private notifyMetric(callback: (() => void) | undefined): void {
        try { callback?.(); }
        catch (error) { console.error('[AudioPlayer] Metric observer failed', error); }
    }

    private send(command: Command, transfer?: Transferable[]): void {
        this.node?.port.postMessage(command, transfer ?? []);
    }

    private async prepare(): Promise<void> {
        if (this.destroyed) return;
        if (this.setup) return this.setup;
        const operation = (async () => {
            const context = new AudioContext({ sampleRate: OUTPUT_SAMPLE_RATE_HZ });
            let createdNode: AudioWorkletNode | null = null;
            this.audioContext = context;
            try {
                if (context.sampleRate !== OUTPUT_SAMPLE_RATE_HZ) throw new Error('Unsupported playback sample rate');
                await context.audioWorklet.addModule('/audio-output-pipeline.js');
                if (this.destroyed) return;
                await context.audioWorklet.addModule('/audio-output-worklet.js');
                if (this.destroyed) return;
                // Stop may advance the generation during either module load.
                const node = new AudioWorkletNode(context, 'audio-output-processor', {
                    numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [1],
                    processorOptions: { generation: this.generation },
                });
                createdNode = node;
                if (this.destroyed) { node.port.close(); node.disconnect(); return; }
                node.port.onmessage = ({ data }: MessageEvent<unknown>) => this.receive(data);
                node.onprocessorerror = () => this.failPlayback();
                node.connect(context.destination);
                this.audioContext = context;
                this.node = node;
            } catch (error) {
                if (this.audioContext === context) this.audioContext = null;
                if (createdNode && this.node !== createdNode) {
                    createdNode.port.onmessage = null;
                    createdNode.onprocessorerror = null;
                    createdNode.port.close();
                    createdNode.disconnect();
                }
                if (context.state !== 'closed') void context.close().catch(() => {});
                throw error;
            }
        })();
        this.setup = operation;
        try { await operation; }
        catch (error) {
            if (this.setup === operation) this.setup = null;
            throw error;
        }
    }

    /** Admission precedes asynchronous setup so pending payloads stay bounded. */
    playAudio(base64: string): Promise<void> {
        if (this.destroyed || this.failed) return Promise.resolve();
        const encodedBytes = base64.length;
        const estimatedPcmBytes = Math.floor(encodedBytes * 3 / 4);
        if (!encodedBytes || encodedBytes % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(base64) ||
            estimatedPcmBytes < 2 || estimatedPcmBytes > MAX_IN_FLIGHT_BYTES ||
            this.pendingEncodedBytes + encodedBytes > MAX_PENDING_ENCODED_BYTES) {
            this.notify({ type: 'main_overflow', generation: this.generation });
            this.failPlayback();
            return Promise.resolve();
        }
        return new Promise(resolve => {
            const chunk: PendingChunk = { base64, generation: this.generation,
                chunkId: ++this.nextChunkId, encodedBytes, resolve, admittedAtMs: performance.now() };
            if (this.firstAdmissionAtMs === null) this.firstAdmissionAtMs = chunk.admittedAtMs;
            this.pending.push(chunk);
            this.pendingEncodedBytes += encodedBytes;
            this.notify({ type: 'pending', generation: chunk.generation, chunkId: chunk.chunkId,
                pendingEncodedBytes: this.pendingEncodedBytes });
            void this.drain();
        });
    }

    private async drain(): Promise<void> {
        if (this.draining || this.destroyed) return;
        this.draining = true;
        let waitingForAck = false;
        try {
            while (this.pending.length && !this.destroyed && !this.failed) {
                const owner = this.generation;
                try {
                    const setupStartedAtMs = performance.now();
                    await this.prepare();
                    const setupWaitMs = performance.now() - setupStartedAtMs;
                    if (this.destroyed || owner !== this.generation) continue;
                    const context = this.audioContext;
                    if (!context || !this.node) throw new Error('Playback context unavailable');
                    const resumeStartedAtMs = performance.now();
                    if (context.state === 'suspended') await context.resume();
                    const resumeWaitMs = performance.now() - resumeStartedAtMs;
                    if (this.destroyed || owner !== this.generation) continue;
                    let firstTransfer = true;
                    while (this.pending.length && this.pending[0].generation === owner) {
                        const chunk = this.pending[0];
                        // Let the worklet acknowledge transfers before spending more transport budget.
                        if (this.inFlightBytes + Math.floor(chunk.encodedBytes * 3 / 4) > MAX_IN_FLIGHT_BYTES) {
                            chunk.capacityWaitStartedAtMs ??= performance.now();
                            waitingForAck = true;
                            break;
                        }
                        const capacityWaitMs = chunk.capacityWaitStartedAtMs === undefined
                            ? 0 : performance.now() - chunk.capacityWaitStartedAtMs;
                        const conversionStartedAtMs = performance.now();
                        const binary = atob(chunk.base64);
                        if (!binary.length || binary.length % 2 || binary.length > MAX_IN_FLIGHT_BYTES) {
                            this.failPlayback();
                            return;
                        }
                        const pcm = new Uint8Array(binary.length);
                        for (let i = 0; i < binary.length; i++) pcm[i] = binary.charCodeAt(i);
                        // Ownership moves from the pending string to a transport reservation.
                        this.pending.shift();
                        this.pendingEncodedBytes -= chunk.encodedBytes;
                        this.inFlight.set(chunk.chunkId, { generation: owner, bytes: pcm.byteLength });
                        this.inFlightBytes += pcm.byteLength;
                        try {
                            this.send({ type: 'audio', generation: owner, chunkId: chunk.chunkId, buffer: pcm.buffer }, [pcm.buffer]);
                        } finally {
                            // The chunk left the FIFO; failure handling cannot find it there.
                            chunk.resolve();
                        }
                        this.notify({ type: 'transferred', generation: owner, chunkId: chunk.chunkId,
                            samples: binary.length / 2, pendingEncodedBytes: this.pendingEncodedBytes,
                            inFlightBytes: this.inFlightBytes,
                            admissionToTransferMs: performance.now() - chunk.admittedAtMs,
                            capacityWaitMs, conversionTransferMs: performance.now() - conversionStartedAtMs,
                            ...(firstTransfer ? { setupWaitMs, resumeWaitMs } : {}) });
                        firstTransfer = false;
                    }
                    this.flushCompletion();
                    if (waitingForAck) return;
                } catch {
                    if (!this.destroyed && owner === this.generation) this.failPlayback();
                }
            }
        } finally {
            this.draining = false;
            if (this.pending.length && !waitingForAck && !this.destroyed && !this.failed) void this.drain();
        }
    }

    private receive(data: unknown): void {
        if (this.destroyed || !data || typeof data !== 'object') return;
        const event = data as Partial<WorkletEvent>;
        if (!WORKLET_EVENT_TYPES.has(event.type as PlaybackBufferEventType) || !Number.isSafeInteger(event.generation) ||
            event.generation !== this.generation) return;
        if (event.type === 'accepted' || event.type === 'rejected' || event.type === 'stale' || event.type === 'overflow') {
            if (!Number.isSafeInteger(event.chunkId)) return;
            const reservation = this.inFlight.get(event.chunkId!);
            if (!reservation || reservation.generation !== event.generation) return;
            this.inFlight.delete(event.chunkId!);
            this.inFlightBytes -= reservation.bytes;
            if (event.type === 'accepted') void this.drain();
        }
        event.pendingEncodedBytes = this.pendingEncodedBytes;
        event.inFlightBytes = this.inFlightBytes;
        if (typeof event.queueDepthMs === 'number' && Number.isFinite(event.queueDepthMs) &&
            event.queueDepthMs >= 0)
            this.queueDepthMs = event.queueDepthMs;
        if (event.type === 'cleared') {
            const requestedAt = this.clearRequestedAt.get(event.generation!);
            this.clearRequestedAt.delete(event.generation!);
            if (requestedAt !== undefined && event.reason === 'interruption')
                event.clearAcknowledgmentMs = performance.now() - requestedAt;
        }
        // Publish the final worklet counters before a lifecycle callback can dispose us.
        if (event.type === 'started') {
            this.isPlaying = true;
            if (this.firstAdmissionAtMs !== null)
                event.admissionToFirstRenderMs = performance.now() - this.firstAdmissionAtMs;
        }
        let wasPlaying = false;
        if (event.type === 'ended') {
            wasPlaying = this.isPlaying;
            this.isPlaying = false;
            this.firstAdmissionAtMs = null;
        }
        this.notify(event as PlaybackBufferEvent);
        if (this.destroyed) return;
        if (event.type === 'started') this.callbacks.onPlayStart?.();
        if (event.type === 'ended' && wasPlaying) this.callbacks.onPlayEnd?.();
        if (event.type === 'underrun') this.notifyMetric(this.callbacks.onUnderrun);
        if (event.type === 'accepted' && typeof event.queueDepthMs === 'number' &&
            Number.isFinite(event.queueDepthMs) && event.queueDepthMs >= 0)
            this.notifyMetric(() => this.callbacks.onAudioScheduled?.(event.queueDepthMs!));
        if (event.type === 'overflow' || event.type === 'rejected') this.failPlayback();
    }

    completeTurn(): void {
        if (this.destroyed || this.failed) return;
        if (!this.hasPendingAudio()) return;
        this.completionRequested = true;
        this.flushCompletion();
    }

    hasPendingAudio(): boolean {
        return !this.destroyed && (this.pending.length > 0 || this.inFlightBytes > 0 || this.queueDepthMs > 0 || this.isPlaying);
    }

    private flushCompletion(): void {
        // MessagePort ordering puts completion after every admitted transfer.
        if (this.completionRequested && !this.pending.length && this.node) {
            this.send({ type: 'complete', generation: this.generation });
            this.completionRequested = false;
        }
    }

    private failPlayback(): void {
        if (this.destroyed || this.failed) return;
        this.failed = true;
        this.stop('failure');
        this.callbacks.onPlaybackError?.();
    }

    stop(reason = 'interruption'): void {
        if (this.destroyed) return;
        this.generation++;
        for (const chunk of this.pending) chunk.resolve();
        this.pending = [];
        this.pendingEncodedBytes = 0;
        this.inFlight.clear();
        this.inFlightBytes = 0;
        this.queueDepthMs = 0;
        this.completionRequested = false;
        this.isPlaying = false;
        this.firstAdmissionAtMs = null;
        this.clearRequestedAt.clear();
        if (this.node) {
            if (reason === 'interruption') this.clearRequestedAt.set(this.generation, performance.now());
            this.notify({ type: 'clear_requested', generation: this.generation, reason,
                pendingEncodedBytes: 0, inFlightBytes: 0, queueDepthMs: 0 });
            this.send({ type: 'clear', generation: this.generation, reason });
        } else this.notify({ type: 'pending', generation: this.generation,
            pendingEncodedBytes: 0, inFlightBytes: 0, queueDepthMs: 0 });
    }

    cleanup(): void {
        if (this.destroyed) return;
        this.stop('cleanup');
        this.destroyed = true;
        this.clearRequestedAt.clear();
        if (this.node) {
            this.node.port.onmessage = null;
            this.node.onprocessorerror = null;
            this.node.port.close();
            this.node.disconnect();
            this.node = null;
        }
        const context = this.audioContext;
        this.audioContext = null;
        if (context) void context.close().catch(() => {});
    }
}
