/** Audio-thread microphone DSP and bounded worklet-to-main handoff. */
class PCMProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const { AudioInputPipeline } = globalThis.VeenoeAudioInput;
    this.pending = 0;
    this.dropped = 0;
    this.pipeline = new AudioInputPipeline(options.processorOptions.sourceRate, (buffer) => {
      if (this.pending >= 3) {
        this.dropped++;
        return;
      }
      this.pending++;
      this.port.postMessage({ buffer, dropped: this.dropped, createdAtMs: currentTime * 1000 }, [buffer]);
      this.dropped = 0;
    });
    this.port.onmessage = (event) => {
      if (event.data === 'ack') {
        this.pending = Math.max(0, this.pending - 1);
        if (this.dropped) {
          this.port.postMessage({ dropped: this.dropped });
          this.dropped = 0;
        }
      }
    };
  }

  process(inputs) {
    const channel = inputs[0]?.[0];
    if (channel) this.pipeline.push(channel);
    return true;
  }
}

registerProcessor('pcm-processor', PCMProcessor);
