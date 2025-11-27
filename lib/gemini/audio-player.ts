export class AudioPlayer {
    private audioContext: AudioContext | null = null;
    private nextStartTime = 0;
    private onPlayStart?: () => void;
    private onPlayEnd?: () => void;
    private sources = new Set<AudioBufferSourceNode>();
    private isPlaying = false;

    constructor(callbacks?: { onPlayStart?: () => void; onPlayEnd?: () => void }) {
        this.onPlayStart = callbacks?.onPlayStart;
        this.onPlayEnd = callbacks?.onPlayEnd;
    }

    async initialize(): Promise<void> {
        // Audio context will be created on first play to respect browser autoplay policies
        console.log("Audio player initialized");
    }

    async playAudio(base64String: string): Promise<void> {
        if (!this.audioContext || this.audioContext.state === "closed") {
            this.audioContext = new AudioContext({ sampleRate: 24000 });
            this.nextStartTime = this.audioContext.currentTime;
        }

        // Resume context if suspended (browser autoplay policy)
        if (this.audioContext.state === "suspended") {
            await this.audioContext.resume();
        }

        const float32AudioData = this.base64ToFloat32AudioData(base64String);

        // Create buffer
        const audioBuffer = this.audioContext.createBuffer(
            1,
            float32AudioData.length,
            24000
        );
        audioBuffer.copyToChannel(float32AudioData as any, 0);

        // Create source
        const source = this.audioContext.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(this.audioContext.destination);

        // Schedule playback
        // Ensure we don't schedule in the past, but also keep the stream continuous
        this.nextStartTime = Math.max(this.nextStartTime, this.audioContext.currentTime);
        source.start(this.nextStartTime);

        // Track the source
        this.sources.add(source);

        // Update state and trigger callback if this is the first active source
        if (!this.isPlaying) {
            this.isPlaying = true;
            this.onPlayStart?.();
        }

        // Advance time for next chunk
        this.nextStartTime += audioBuffer.duration;

        // Cleanup when this specific source ends
        source.onended = () => {
            this.sources.delete(source);
            // If no more sources are playing, trigger end callback
            if (this.sources.size === 0 && this.isPlaying) {
                this.isPlaying = false;
                this.onPlayEnd?.();
            }
        };
    }

    stop(): void {
        console.log("[AudioPlayer] Stopping all audio sources");
        this.sources.forEach(source => {
            try {
                source.stop();
            } catch (e) {
                // Ignore errors if source already stopped
            }
        });
        this.sources.clear();

        // Reset time tracking
        if (this.audioContext) {
            this.nextStartTime = this.audioContext.currentTime;
        }

        this.isPlaying = false;
        // We don't trigger onPlayEnd here because this is a forced stop (interruption)
    }

    private base64ToFloat32AudioData(base64String: string): Float32Array {
        const byteCharacters = atob(base64String);
        const byteArray = new Uint8Array(byteCharacters.length);

        for (let i = 0; i < byteCharacters.length; i++) {
            byteArray[i] = byteCharacters.charCodeAt(i);
        }

        // Convert Uint8Array (which contains 16-bit PCM) to Float32Array
        const length = byteArray.length / 2; // 16-bit audio, so 2 bytes per sample
        const float32AudioData = new Float32Array(length);

        const dataView = new DataView(byteArray.buffer);

        for (let i = 0; i < length; i++) {
            // Read 16-bit signed integer (little-endian)
            const sample = dataView.getInt16(i * 2, true);

            // Convert from 16-bit PCM to Float32 (range -1 to 1)
            float32AudioData[i] = sample < 0 ? sample / 32768 : sample / 32767;
        }

        return float32AudioData;
    }

    cleanup(): void {
        this.stop();
        if (this.audioContext) {
            this.audioContext.close();
            this.audioContext = null;
        }
        console.log("Audio player cleaned up");
    }
}