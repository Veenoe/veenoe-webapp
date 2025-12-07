/**
 * Audio Utility Functions
 * Pure functions for audio data conversion - easily testable without WebSocket
 */

/**
 * Converts an ArrayBuffer of PCM audio data to a base64 string
 * @param audioData PCM audio data as ArrayBuffer
 * @returns Base64 encoded string
 */
export function arrayBufferToBase64(audioData: ArrayBuffer): string {
    const bytes = new Uint8Array(audioData);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
}

/**
 * Converts a base64 string to Float32Array for audio playback
 * @param base64String Base64 encoded PCM audio
 * @returns Float32Array suitable for AudioContext
 */
export function base64ToFloat32(base64String: string): Float32Array {
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
