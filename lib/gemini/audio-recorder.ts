/**
 * Audio Recorder
 * Handles microphone input using AudioWorklet for jitter-free, off-main-thread audio processing.
 * Note: For audio playback, use AudioPlayer instead.
 */

export interface AudioConfig {
    sampleRate: number;
    channels: number;
}

const DEFAULT_AUDIO_CONFIG: AudioConfig = {
    sampleRate: 16000, // Gemini requires 16kHz
    channels: 1,
};

export class AudioRecorder {
    private audioContext: AudioContext | null = null;
    private mediaStream: MediaStream | null = null;
    private audioWorkletNode: AudioWorkletNode | null = null;
    private sourceNode: MediaStreamAudioSourceNode | null = null;
    private isRecording = false;
    private config: AudioConfig = DEFAULT_AUDIO_CONFIG;

    async initialize(): Promise<void> {
        try {
            // 1. Create AudioContext
            // We explicitly set the sample rate to 16000 to avoid expensive resampling later
            this.audioContext = new AudioContext({
                sampleRate: this.config.sampleRate,
            });

            // 2. Load the Worklet Module
            // This loads the file we created in /public
            // Use dynamic base path for deployment flexibility
            const basePath = process.env.NEXT_PUBLIC_BASE_PATH || '';
            await this.audioContext.audioWorklet.addModule(`${basePath}/audio-worklet-processor.js`);

            // 3. Request Mic Access
            this.mediaStream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    sampleRate: this.config.sampleRate,
                    channelCount: this.config.channels,
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true,
                },
            });

            console.log("Audio Pipeline Initialized: 16kHz / Worklet Ready");
        } catch (error) {
            console.error("Failed to initialize audio:", error);
            throw new Error(
                "Microphone access denied or Worklet failed to load."
            );
        }
    }

    async startRecording(
        onAudioData: (audioData: ArrayBuffer) => void
    ): Promise<void> {
        if (!this.audioContext || !this.mediaStream) {
            throw new Error("Audio not initialized. Call initialize() first.");
        }

        if (this.isRecording) return;

        try {
            // Resume context if it was suspended (browser policy)
            if (this.audioContext.state === 'suspended') {
                await this.audioContext.resume();
            }

            // 1. Create Source
            this.sourceNode = this.audioContext.createMediaStreamSource(this.mediaStream);

            // 2. Create Worklet Node
            // 'pcm-processor' must match the name in registerProcessor() inside the .js file
            this.audioWorkletNode = new AudioWorkletNode(this.audioContext, 'pcm-processor');

            // 3. Handle Messages from the Audio Thread
            this.audioWorkletNode.port.onmessage = (event) => {
                if (!this.isRecording) return;
                // event.data is the ArrayBuffer sent from the worklet
                onAudioData(event.data);
            };

            // 4. Connect the Graph
            this.sourceNode.connect(this.audioWorkletNode);
            // Note: We do NOT connect to destination (speakers) to avoid feedback loop

            this.isRecording = true;
            console.log("Recording started via AudioWorklet");
        } catch (error) {
            console.error("Failed to start recording:", error);
            throw error;
        }
    }

    stopRecording(): void {
        this.isRecording = false;

        if (this.audioWorkletNode) {
            this.audioWorkletNode.disconnect();
            this.audioWorkletNode = null;
        }

        if (this.sourceNode) {
            this.sourceNode.disconnect();
            this.sourceNode = null;
        }

        console.log("Recording stopped");
    }

    cleanup(): void {
        this.stopRecording();

        if (this.mediaStream) {
            this.mediaStream.getTracks().forEach((track) => track.stop());
            this.mediaStream = null;
        }

        if (this.audioContext) {
            this.audioContext.close();
            this.audioContext = null;
        }
    }
}