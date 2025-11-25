export class AudioPlayer {
    private audioContext: AudioContext | null = null;
    private messageQueue: Float32Array[] = [];
    private queueProcessing = false;
    private nextStartTime = 0;

    async initialize(): Promise<void> {
        // Audio context will be created on first play to respect browser autoplay policies
        console.log("Audio player initialized");
    }

    async playAudio(base64String: string): Promise<void> {
        const float32AudioData = this.base64ToFloat32AudioData(base64String);
        this.messageQueue.push(float32AudioData);

        if (!this.queueProcessing) {
            await this.playAudioData();
        }
    }

    private base64ToFloat32AudioData(base64String: string): Float32Array {
        const byteCharacters = atob(base64String);
        const byteArray: number[] = [];
        
        for (let i = 0; i < byteCharacters.length; i++) {
            byteArray.push(byteCharacters.charCodeAt(i));
        }
        
        const audioChunks = new Uint8Array(byteArray);
        
        // Convert Uint8Array (which contains 16-bit PCM) to Float32Array
        const length = audioChunks.length / 2; // 16-bit audio, so 2 bytes per sample
        const float32AudioData = new Float32Array(length);
        
        for (let i = 0; i < length; i++) {
            // Combine two bytes into one 16-bit signed integer (little-endian)
            let sample = audioChunks[i * 2] | (audioChunks[i * 2 + 1] << 8);
            
            // Convert from 16-bit PCM to Float32 (range -1 to 1)
            if (sample >= 32768) sample -= 65536;
            float32AudioData[i] = sample / 32768;
        }
        
        return float32AudioData;
    }

    private async playAudioData(): Promise<void> {
        this.queueProcessing = true;

        if (!this.audioContext || this.audioContext.state === "closed") {
            this.audioContext = new AudioContext();
            this.nextStartTime = this.audioContext.currentTime;
        }

        while (this.messageQueue.length > 0) {
            const audioChunks = this.messageQueue.shift();
            if (!audioChunks) continue;

            // Gemini Native Audio Output is 24kHz
            // We explicitly tell the buffer this is 24000 sample rate
            const audioBuffer = this.audioContext.createBuffer(
                1,
                audioChunks.length,
                24000
            );
            
            // FIX: Type assertion "as any" or "as Float32Array" resolves the ArrayBufferLike mismatch
            audioBuffer.copyToChannel(audioChunks as any, 0);

            // Create an AudioBufferSourceNode
            const source = this.audioContext.createBufferSource();
            source.buffer = audioBuffer;

            // Connect the source to the destination (speakers)
            source.connect(this.audioContext.destination);

            // Schedule the audio to play seamlessly
            // If nextStartTime is in the past (due to lag), reset it to now
            if (this.nextStartTime < this.audioContext.currentTime) {
                this.nextStartTime = this.audioContext.currentTime;
            }

            source.start(this.nextStartTime);

            // Advance the next start time by the duration of the current buffer
            this.nextStartTime += audioBuffer.duration;
        }

        this.queueProcessing = false;
    }

    cleanup(): void {
        this.messageQueue = [];
        
        if (this.audioContext) {
            this.audioContext.close();
            this.audioContext = null;
        }
        
        console.log("Audio player cleaned up");
    }
}