/**
 * PCM Processor Worker
 * Runs on the dedicated Audio Thread to prevent UI-blocking audio drops.
 * Converts Float32 Audio to Int16 PCM in real-time.
 */
class PCMProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    // Internal buffer to accumulate samples if needed, though we usually stream chunks directly
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0];
    if (!input || input.length === 0) return true;

    const channelData = input[0]; // Mono channel
    
    // Convert Float32 (-1.0 to 1.0) to Int16 (-32768 to 32767)
    // We do this calculation HERE on the worker thread, not the main thread
    const pcmData = new Int16Array(channelData.length);
    for (let i = 0; i < channelData.length; i++) {
      const s = Math.max(-1, Math.min(1, channelData[i]));
      pcmData[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
    }

    // Send data back to the main thread
    // We use a Transferable Object (the buffer) for zero-copy performance
    this.port.postMessage(pcmData.buffer, [pcmData.buffer]);

    return true; // Keep processor alive
  }
}

registerProcessor('pcm-processor', PCMProcessor);