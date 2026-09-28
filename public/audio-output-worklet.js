class AudioOutputProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.queue = new globalThis.VeenoeAudioOutput.AudioOutputPipeline();
    this.generation = 0;
    this.failed = false;
    this.port.onmessage = ({ data }) => {
      if (data.type === 'clear') {
        this.generation = data.generation;
        this.queue.clear();
        this.failed = false;
      }
      if (data.generation !== this.generation) return;
      if (data.type === 'complete') this.queue.completeTurn();
      if (data.type === 'audio' && !this.failed) {
        if (!this.queue.enqueue(data.buffer)) {
          this.queue.clear();
          this.failed = true;
          this.port.postMessage({ type: 'overflow', generation: this.generation });
        } else {
          this.port.postMessage({
            type: 'depth', generation: this.generation,
            queueDepthMs: this.queue.queueDepthMs, acceptedBytes: data.buffer.byteLength,
          });
        }
      }
    };
  }

  process(_inputs, outputs) {
    const channel = outputs[0]?.[0];
    if (!channel) return true;
    const wasStarted = this.queue.started;
    const event = this.queue.render(channel);
    if (!wasStarted && this.queue.started) this.port.postMessage({ type: 'started', generation: this.generation });
    if (event && event !== 'started') this.port.postMessage({ type: event, generation: this.generation });
    // This source must remain alive across empty queues and future Gemini turns.
    return true;
  }
}

registerProcessor('audio-output-processor', AudioOutputProcessor);
