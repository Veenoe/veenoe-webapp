/** Microphone capture. Audio-thread DSP lives in public/audio-input-pipeline.js. */
export interface MicrophoneFormat {
    processingSampleRate: number;
    trackSampleRate: number | null;
    outputSampleRate: 16000;
    packetTargetMs: 20;
    resamplingActive: boolean;
}

interface WorkletPacket {
    buffer?: ArrayBuffer;
    dropped: number;
    createdAtMs: number;
}

export class AudioRecorder {
    private audioContext: AudioContext | null = null;
    private mediaStream: MediaStream | null = null;
    private audioWorkletNode: AudioWorkletNode | null = null;
    private sourceNode: MediaStreamAudioSourceNode | null = null;
    private silentOutput: GainNode | null = null;
    private isRecording = false;

    getFormat(): MicrophoneFormat {
        if (!this.audioContext) throw new Error('Audio not initialized');
        const processingSampleRate = this.audioContext.sampleRate;
        const trackSampleRate = this.mediaStream?.getAudioTracks()[0]?.getSettings().sampleRate ?? null;
        return {
            processingSampleRate, trackSampleRate, outputSampleRate: 16000,
            packetTargetMs: 20, resamplingActive: processingSampleRate !== 16000
        };
    }

    async initialize(): Promise<void> {
        try {
            // Let the browser choose the graph rate; it is the actual worklet input rate.
            this.audioContext = new AudioContext();
            const basePath = process.env.NEXT_PUBLIC_BASE_PATH || '';
            await this.audioContext.audioWorklet.addModule(`${basePath}/audio-input-pipeline.js`);
            await this.audioContext.audioWorklet.addModule(`${basePath}/audio-worklet-processor.js`);
            this.mediaStream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    channelCount: 1, echoCancellation: true,
                    noiseSuppression: true, autoGainControl: true
                },
            });
        } catch {
            this.cleanup();
            throw new Error('Microphone access denied or Worklet failed to load.');
        }
    }

    async startRecording(
        onAudioData: (audioData: ArrayBuffer) => void,
        onPacketsDropped: (count: number) => void = () => { },
    ): Promise<void> {
        if (!this.audioContext || !this.mediaStream) {
            throw new Error('Audio not initialized. Call initialize() first.');
        }
        if (this.isRecording) return;
        if (this.audioContext.state === 'suspended') await this.audioContext.resume();
        this.sourceNode = this.audioContext.createMediaStreamSource(this.mediaStream);
        this.audioWorkletNode = new AudioWorkletNode(this.audioContext, 'pcm-processor', {
            processorOptions: { sourceRate: this.audioContext.sampleRate },
        });
        const node = this.audioWorkletNode;
        this.isRecording = true;
        node.port.onmessage = (event: MessageEvent<WorkletPacket>) => {
            const { buffer, dropped, createdAtMs } = event.data;
            try {
                if (!this.isRecording) return;
                if (dropped > 0) onPacketsDropped(dropped);
                if (!buffer) return;
                // Discard audio delayed by a busy main thread; freshness matters for Live.
                if (this.audioContext && this.audioContext.currentTime * 1000 - createdAtMs > 100) onPacketsDropped(1);
                else onAudioData(buffer);
            } finally {
                if (buffer) node.port.postMessage('ack');
            }
        };
        this.sourceNode.connect(node);
        // Keep the processing graph pulled, while outputting silence to speakers.
        this.silentOutput = this.audioContext.createGain();
        this.silentOutput.gain.value = 0;
        node.connect(this.silentOutput).connect(this.audioContext.destination);
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
        this.mediaStream?.getTracks().forEach((track) => track.stop());
        this.mediaStream = null;
        void this.audioContext?.close();
        this.audioContext = null;
    }
}
