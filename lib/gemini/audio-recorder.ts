/** Microphone capture. Audio-thread DSP lives in public/audio-input-pipeline.js. */
export interface MicrophoneFormat {
    processingSampleRate: number;
    trackSampleRate: number | null;
    outputSampleRate: number;
    packetTargetMs: number;
    resamplingActive: boolean;
}

type AudioFeature = 'channelCount' | 'echoCancellation' | 'noiseSuppression' | 'autoGainControl' | 'sampleRate' | 'sampleSize';
export type MicrophoneDiagnostics = {
    requested: Pick<MediaTrackConstraints, 'channelCount' | 'echoCancellation' | 'noiseSuppression' | 'autoGainControl'>;
    supported: Partial<Pick<MediaTrackSupportedConstraints, AudioFeature>>;
    applied: Partial<Pick<MediaTrackSettings, AudioFeature>>;
    capabilities: Partial<Pick<MediaTrackCapabilities, AudioFeature>> | null;
};
export type MicrophoneLevel = { rmsDbfs: number; peakDbfs: number; clippedSampleRatio: number };
export type MicrophoneDropReason = 'worklet_backpressure' | 'stale_main' | 'forwarding_failure' |
    'transport_unready' | 'send_failure';
export interface MicrophonePacketTiming {
    sequence: number;
    captureToMainAgeMs: number;
}
export type MicrophoneErrorCode = 'permission_denied' | 'not_found' | 'unavailable' | 'constraint' | 'unsupported' | 'processing' | 'unexpected' | 'ended';

export class MicrophoneError extends Error {
    constructor(public readonly code: MicrophoneErrorCode) {
        super({
            permission_denied: 'Microphone access is blocked. Allow microphone access and try again.',
            not_found: 'No microphone was found.',
            unavailable: 'The microphone is unavailable. Check the device and try again.',
            constraint: 'The microphone could not satisfy the requested audio settings.',
            unsupported: 'Microphone capture requires a supported, secure browser environment.',
            processing: 'Audio processing could not be initialized. Refresh and try again.',
            unexpected: 'The microphone could not be initialized. Try again.',
            ended: 'The microphone disconnected. Check the device and start a new session.',
        }[code]);
        this.name = 'MicrophoneError';
    }
}

const REQUESTED_AUDIO = { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true } as const;
const AUDIO_FIELDS: AudioFeature[] = ['channelCount', 'echoCancellation', 'noiseSuppression', 'autoGainControl', 'sampleRate', 'sampleSize'];
function audioFields<T extends object>(source: T): Partial<Pick<T, Extract<AudioFeature, keyof T>>> {
    return Object.fromEntries(AUDIO_FIELDS.filter(key => key in source).map(key => [key, source[key as keyof T]])) as Partial<Pick<T, Extract<AudioFeature, keyof T>>>;
}
export function captureMicrophoneDiagnostics(track: MediaStreamTrack, devices: MediaDevices): MicrophoneDiagnostics {
    let capabilities: MicrophoneDiagnostics['capabilities'] = null;
    try {
        if (typeof track.getCapabilities === 'function') capabilities = audioFields(track.getCapabilities());
    } catch { /* Some browsers expose the method but cannot report capabilities. */ }
    return {
        requested: { ...REQUESTED_AUDIO },
        supported: audioFields(devices.getSupportedConstraints?.() ?? {}),
        applied: audioFields(track.getSettings?.() ?? {}),
        capabilities,
    };
}
export function classifyMicrophoneError(error: unknown): MicrophoneError {
    const name = error instanceof Error ? error.name : '';
    const code: MicrophoneErrorCode = name === 'NotAllowedError' || name === 'PermissionDeniedError' ? 'permission_denied'
        : name === 'SecurityError' ? 'unsupported'
        : name === 'NotFoundError' || name === 'DevicesNotFoundError' ? 'not_found'
        : name === 'NotReadableError' || name === 'TrackStartError' || name === 'AbortError' ? 'unavailable'
        : name === 'OverconstrainedError' ? 'constraint' : 'unexpected';
    return new MicrophoneError(code);
}

type WorkletMessage =
    | { type: 'format'; outputSampleRate: number; packetTargetMs: number }
    | { type: 'audio'; buffer: ArrayBuffer; dropped: number; createdAtMs: number;
        sequence: number; level?: MicrophoneLevel };

/** Acknowledge every audio message, including stale or failed callbacks. */
export function handleWorkletAudioMessage(
    message: Extract<WorkletMessage, { type: 'audio' }>,
    nowMs: number,
    onAudioData: (buffer: ArrayBuffer, timing: MicrophonePacketTiming) => void,
    onPacketsDropped: (count: number, reason: MicrophoneDropReason, sequence: number) => void,
    acknowledge: () => void,
    onLevel: (level: MicrophoneLevel) => void = () => {},
    onPacketObserved: (timing: MicrophonePacketTiming) => void = () => {},
): void {
    // Both timestamps use this recorder's AudioContext clock.
    const timing = { sequence: message.sequence,
        captureToMainAgeMs: Math.max(0, nowMs - message.createdAtMs) };
    try {
        try { if (message.level) onLevel(message.level); }
        catch { /* Optional diagnostics must not block audio delivery. */ }
        try { onPacketObserved(timing); }
        catch { /* Keep packet observation independent of level reporting. */ }
        if (message.dropped > 0) onPacketsDropped(message.dropped, 'worklet_backpressure', message.sequence);
        if (timing.captureToMainAgeMs > 100) {
            onPacketsDropped(1, 'stale_main', message.sequence);
            return;
        }
        try {
            onAudioData(message.buffer, timing);
        } catch {
            onPacketsDropped(1, 'forwarding_failure', message.sequence);
        }
    } finally {
        acknowledge();
    }
}

export class AudioRecorder {
    private audioContext: AudioContext | null = null;
    private mediaStream: MediaStream | null = null;
    private audioWorkletNode: AudioWorkletNode | null = null;
    private sourceNode: MediaStreamAudioSourceNode | null = null;
    private silentOutput: GainNode | null = null;
    private isRecording = false;
    private track: MediaStreamTrack | null = null;
    private onTrackEnded: (() => void) | null = null;
    private diagnostics: MicrophoneDiagnostics | null = null;

    getMicrophoneDiagnostics(): MicrophoneDiagnostics | null { return this.diagnostics; }

    private getFormat(outputSampleRate: number, packetTargetMs: number): MicrophoneFormat {
        if (!this.audioContext) throw new Error('Audio not initialized');
        const processingSampleRate = this.audioContext.sampleRate;
        const trackSampleRate = this.diagnostics?.applied.sampleRate ?? null;
        return {
            processingSampleRate, trackSampleRate, outputSampleRate,
            packetTargetMs, resamplingActive: processingSampleRate !== outputSampleRate
        };
    }

    async initialize(onUnexpectedEnd?: () => void): Promise<void> {
        try {
            if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) throw new MicrophoneError('unsupported');
            this.mediaStream = await navigator.mediaDevices.getUserMedia({ audio: REQUESTED_AUDIO });
            this.track = this.mediaStream.getAudioTracks()[0] ?? null;
            if (!this.track) throw new MicrophoneError('not_found');
            this.diagnostics = captureMicrophoneDiagnostics(this.track, navigator.mediaDevices);
            this.onTrackEnded = () => {
                this.cleanup();
                onUnexpectedEnd?.();
            };
            this.track.addEventListener('ended', this.onTrackEnded);
        } catch (error) {
            this.cleanup();
            throw error instanceof MicrophoneError ? error : classifyMicrophoneError(error);
        }
        try {
            // Let the browser choose the graph rate; it is the actual worklet input rate.
            this.audioContext = new AudioContext();
            const context = this.audioContext;
            const basePath = process.env.NEXT_PUBLIC_BASE_PATH || '';
            await context.audioWorklet.addModule(`${basePath}/audio-input-pipeline.js`);
            if (!this.track) throw new MicrophoneError('ended');
            await context.audioWorklet.addModule(`${basePath}/audio-worklet-processor.js`);
            if (!this.track || this.track.readyState === 'ended') throw new MicrophoneError('ended');
        } catch (error) {
            this.cleanup();
            throw error instanceof MicrophoneError ? error : new MicrophoneError('processing');
        }
    }

    async startRecording(
        onAudioData: (audioData: ArrayBuffer, timing: MicrophonePacketTiming) => void,
        onPacketsDropped: (count: number, reason: MicrophoneDropReason, sequence: number) => void = () => { },
        onFormat: (format: MicrophoneFormat) => void = () => { },
        onLevel: (level: MicrophoneLevel) => void = () => { },
        onPacketObserved: (timing: MicrophonePacketTiming) => void = () => {},
    ): Promise<void> {
        if (!this.audioContext || !this.mediaStream) {
            throw new Error('Audio not initialized. Call initialize() first.');
        }
        if (this.isRecording) return;
        try {
            if (this.audioContext.state === 'suspended') await this.audioContext.resume();
            this.sourceNode = this.audioContext.createMediaStreamSource(this.mediaStream);
            this.audioWorkletNode = new AudioWorkletNode(this.audioContext, 'pcm-processor', {
                processorOptions: { sourceRate: this.audioContext.sampleRate },
            });
            const node = this.audioWorkletNode;
            node.port.onmessage = (event: MessageEvent<WorkletMessage>) => {
                if (!this.isRecording) return;
                if (event.data.type === 'format') {
                    onFormat(this.getFormat(event.data.outputSampleRate, event.data.packetTargetMs));
                    return;
                }
                handleWorkletAudioMessage(event.data, this.audioContext!.currentTime * 1000,
                    onAudioData, onPacketsDropped, () => node.port.postMessage('ack'), onLevel, onPacketObserved);
            };
            this.sourceNode.connect(node);
            // Keep the processing graph pulled, while outputting silence to speakers.
            this.silentOutput = this.audioContext.createGain();
            this.silentOutput.gain.value = 0;
            node.connect(this.silentOutput).connect(this.audioContext.destination);
            this.isRecording = true;
        } catch {
            this.stopRecording();
            throw new MicrophoneError('processing');
        }
    }

    stopRecording(): void {
        this.isRecording = false;
        this.audioWorkletNode?.disconnect();
        this.audioWorkletNode?.port.close();
        this.audioWorkletNode = null;
        this.sourceNode?.disconnect();
        this.sourceNode = null;
        this.silentOutput?.disconnect();
        this.silentOutput = null;
        // A new node creates fresh resampler and packetizer state.
    }

    cleanup(): void {
        this.stopRecording();
        if (this.track && this.onTrackEnded) this.track.removeEventListener('ended', this.onTrackEnded);
        this.track = null;
        this.onTrackEnded = null;
        this.mediaStream?.getTracks().forEach((track) => track.stop());
        this.mediaStream = null;
        this.diagnostics = null;
        void this.audioContext?.close();
        this.audioContext = null;
    }
}
