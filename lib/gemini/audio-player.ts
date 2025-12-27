/**
 * AudioPlayer - Handles audio playback for Gemini Live API responses.
 * 
 * Design Decisions (First Principles):
 * 1. Lazy AudioContext creation (browser autoplay policy)
 * 2. Source tracking with proper cleanup to prevent memory leaks
 * 3. Guard checks in callbacks to handle race conditions during cleanup
 * 4. Clear separation between normal end and forced stop
 */

// Debug utility - disabled in production
const debug = process.env.NODE_ENV !== 'production'
    ? (...args: unknown[]) => console.log('[AudioPlayer]', ...args)
    : () => { };

export class AudioPlayer {
    private audioContext: AudioContext | null = null;
    private nextStartTime = 0;
    private onPlayStart?: () => void;
    private onPlayEnd?: () => void;
    private sources = new Set<AudioBufferSourceNode>();
    private isPlaying = false;
    private isDestroyed = false;  // Guard flag to prevent stale callbacks

    constructor(callbacks?: { onPlayStart?: () => void; onPlayEnd?: () => void }) {
        this.onPlayStart = callbacks?.onPlayStart;
        this.onPlayEnd = callbacks?.onPlayEnd;
    }

    async initialize(): Promise<void> {
        // Audio context will be created on first play to respect browser autoplay policies
        debug("Initialized (AudioContext will be created on first play)");
    }

    async playAudio(base64String: string): Promise<void> {
        // Guard: Don't play if destroyed
        if (this.isDestroyed) {
            debug("Ignoring play request - player is destroyed");
            return;
        }

        try {
            if (!this.audioContext || this.audioContext.state === "closed") {
                this.audioContext = new AudioContext({ sampleRate: 24000 });
                this.nextStartTime = this.audioContext.currentTime;
            }

            // Resume context if suspended (browser autoplay policy)
            if (this.audioContext.state === "suspended") {
                await this.audioContext.resume();
            }
        } catch (error) {
            debug("Failed to create/resume AudioContext:", error);
            throw new Error("Audio playback is not supported in this browser");
        }

        const float32AudioData = this.base64ToFloat32AudioData(base64String);

        // Create buffer
        const audioBuffer = this.audioContext.createBuffer(
            1,
            float32AudioData.length,
            24000
        );
        audioBuffer.copyToChannel(new Float32Array(float32AudioData), 0);

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
            // Guard: Check if source was already cleaned up (prevents memory leak)
            // This can happen if stop() was called while audio was playing
            if (!this.sources.has(source)) {
                return;
            }

            this.sources.delete(source);

            // If no more sources are playing, trigger end callback
            // But only if we haven't been destroyed
            if (this.sources.size === 0 && this.isPlaying && !this.isDestroyed) {
                this.isPlaying = false;
                this.onPlayEnd?.();
            }
        };
    }

    stop(): void {
        debug("Stopping all audio sources");

        // Clear all sources
        this.sources.forEach(source => {
            // Remove callback first to prevent it from firing
            source.onended = null;
            try {
                source.stop();
            } catch {
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
        debug("Cleaning up");

        // Mark as destroyed to prevent any pending callbacks from executing
        this.isDestroyed = true;

        this.stop();

        if (this.audioContext) {
            this.audioContext.close();
            this.audioContext = null;
        }
    }
}
