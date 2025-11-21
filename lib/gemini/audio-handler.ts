/**
 * Audio Handler for Viva Examination System
 * Handles microphone capture, PCM conversion, and audio playback
 */

import { DEFAULT_AUDIO_CONFIG, type AudioConfig } from "./live-client";

/**
 * Audio handler class for managing microphone input and audio playback
 */
export class AudioHandler {
    private audioContext: AudioContext | null = null;
    private mediaStream: MediaStream | null = null;
    private audioWorkletNode: AudioWorkletNode | null = null;
    private isRecording = false;
    private config: AudioConfig = DEFAULT_AUDIO_CONFIG;

    /**
     * Initialize audio context and request microphone permission
     */
    async initialize(): Promise<void> {
        try {
            // Create audio context
            this.audioContext = new AudioContext({
                sampleRate: this.config.sampleRate,
            });

            // Request microphone access
            this.mediaStream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    sampleRate: this.config.sampleRate,
                    channelCount: this.config.channels,
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true,
                },
            });

            console.log("Audio initialized successfully");
        } catch (error) {
            console.error("Failed to initialize audio:", error);
            throw new Error(
                "Microphone access denied. Please allow microphone access to continue."
            );
        }
    }

    /**
     * Start recording audio from microphone
     * @param onAudioData - Callback for audio data chunks
     */
    async startRecording(
        onAudioData: (audioData: ArrayBuffer) => void
    ): Promise<void> {
        if (!this.audioContext || !this.mediaStream) {
            throw new Error("Audio not initialized. Call initialize() first.");
        }

        if (this.isRecording) {
            console.warn("Already recording");
            return;
        }

        try {
            // Create media stream source
            const source = this.audioContext.createMediaStreamSource(this.mediaStream);

            // Create script processor for audio processing
            // Note: ScriptProcessorNode is deprecated but AudioWorklet requires separate file
            // For production, consider using AudioWorklet with a separate processor file
            const bufferSize = 4096;
            const processor = this.audioContext.createScriptProcessor(
                bufferSize,
                this.config.channels,
                this.config.channels
            );

            processor.onaudioprocess = (event) => {
                if (!this.isRecording) return;

                const inputData = event.inputBuffer.getChannelData(0);
                const pcmData = this.floatTo16BitPCM(inputData);
                onAudioData(pcmData.buffer as ArrayBuffer);
            };

            // Connect nodes
            source.connect(processor);
            processor.connect(this.audioContext.destination);

            this.isRecording = true;
            console.log("Recording started");
        } catch (error) {
            console.error("Failed to start recording:", error);
            throw error;
        }
    }

    /**
     * Stop recording audio
     */
    stopRecording(): void {
        this.isRecording = false;
        console.log("Recording stopped");
    }

    /**
     * Play audio data through speakers
     * @param audioData - PCM audio data to play
     */
    async playAudio(audioData: ArrayBuffer): Promise<void> {
        if (!this.audioContext) {
            throw new Error("Audio context not initialized");
        }

        try {
            // Convert PCM to Float32Array
            const pcmData = new Int16Array(audioData);
            const floatData = new Float32Array(pcmData.length);

            for (let i = 0; i < pcmData.length; i++) {
                floatData[i] = pcmData[i] / 32768.0; // Convert to -1.0 to 1.0 range
            }

            // Create audio buffer
            const audioBuffer = this.audioContext.createBuffer(
                this.config.channels,
                floatData.length,
                this.config.sampleRate
            );

            audioBuffer.getChannelData(0).set(floatData);

            // Create and play source
            const source = this.audioContext.createBufferSource();
            source.buffer = audioBuffer;
            source.connect(this.audioContext.destination);
            source.start();
        } catch (error) {
            console.error("Failed to play audio:", error);
            throw error;
        }
    }

    /**
     * Convert Float32Array to 16-bit PCM
     */
    private floatTo16BitPCM(float32Array: Float32Array): Int16Array {
        const int16Array = new Int16Array(float32Array.length);

        for (let i = 0; i < float32Array.length; i++) {
            // Clamp to -1.0 to 1.0 range
            const clamped = Math.max(-1, Math.min(1, float32Array[i]));
            // Convert to 16-bit integer
            int16Array[i] = clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff;
        }

        return int16Array;
    }

    /**
     * Check if microphone is available
     */
    static async checkMicrophoneAvailability(): Promise<boolean> {
        try {
            const devices = await navigator.mediaDevices.enumerateDevices();
            return devices.some((device) => device.kind === "audioinput");
        } catch {
            return false;
        }
    }

    /**
     * Clean up resources
     */
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

        console.log("Audio handler cleaned up");
    }

    /**
     * Get recording status
     */
    getIsRecording(): boolean {
        return this.isRecording;
    }
}
