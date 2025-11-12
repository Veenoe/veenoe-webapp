// public/resampler-worklet.js

/**
 * An AudioWorkletProcessor to downsample and convert audio to 16-bit PCM.
 * It receives 32-bit float audio from the microphone and sends
 * 16-bit integer (Int16Array) audio buffers back to the main thread.
 */
class ResamplerWorkletProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.targetSampleRate = 16000;
    this._buffer = null; // Buffer to hold audio data that hasn't been processed yet

    this.port.onmessage = (event) => {
      if (event.data.targetSampleRate) {
        this.targetSampleRate = event.data.targetSampleRate;
      }
    };
  }

  /**
   * Called by the browser with new audio data.
   * @param {Float32Array[][]} inputs - An array of inputs, each with an array of channels.
   * We assume inputs[0][0] is the mono mic input.
   */
  process(inputs) {
    // We assume mono input. inputs[0] is the first input, inputs[0][0] is the first channel.
    const inputChannelData = inputs[0][0];

    if (!inputChannelData) {
      return true; // No data to process
    }

    // Combine with any leftover data from the previous frame
    const data = this._buffer
      ? this.joinFloat32Arrays(this._buffer, inputChannelData)
      : inputChannelData;

    // Calculate the downsampling ratio
    const downsampleRatio = sampleRate / this.targetSampleRate;
    const resultLength = Math.floor(data.length / downsampleRatio);

    if (resultLength === 0) {
      // Not enough data to process, store it for the next frame
      this._buffer = data;
      return true;
    }

    const result = new Int16Array(resultLength);
    let resultIndex = 0;
    let dataIndex = 0;

    // Simple downsampling: pick every Nth sample
    while (resultIndex < resultLength) {
      // Get the sample
      const sample = data[Math.floor(dataIndex)];

      // Convert from 32-bit float (-1.0 to 1.0) to 16-bit int (-32768 to 32767)
      result[resultIndex] = Math.max(-32768, Math.min(32767, sample * 32768));

      resultIndex++;
      dataIndex += downsampleRatio;
    }

    // Store any leftover data for the next frame
    this._buffer = data.length > dataIndex ? data.slice(dataIndex) : null;

    // Send the raw PCM data buffer back to the main thread
    // We transfer ownership of the buffer for performance.
    this.port.postMessage(result.buffer, [result.buffer]);

    return true; // Keep the processor alive
  }

  /**
   * Helper to concatenate two Float32Arrays.
   */
  joinFloat32Arrays(buffer1, buffer2) {
    const newLength = buffer1.length + buffer2.length;
    const newBuffer = new Float32Array(newLength);
    newBuffer.set(buffer1, 0);
    newBuffer.set(buffer2, buffer1.length);
    return newBuffer;
  }
}

registerProcessor("resampler-worklet-processor", ResamplerWorkletProcessor);