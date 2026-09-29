// Commands: audio, complete, clear. Events: accepted, rejected, stale, overflow,
// started, ended, underrun, stats, cleared. Every message carries a generation.
class AudioOutputProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    this.queue = new globalThis.VeenoeAudioOutput.AudioOutputPipeline();
    this.generation = Number.isSafeInteger(options?.processorOptions?.generation)
      ? options.processorOptions.generation : 0;
    this.failed = false;
    this.reportFrames = 0;
    this.reportIntervalFrames = 12000; // 500 ms at 24 kHz; never one message per render quantum.
    this.stats = { receivedSamples: 0, storedSamples: 0, playedSamples: 0,
      clearedSamples: 0, rejectedSamples: 0, waitingSilenceSamples: 0 };
    this.port.onmessage = ({ data }) => {
      if (!data || !Number.isSafeInteger(data.generation)) return;
      if (data.type === 'audio' &&
          (!Number.isSafeInteger(data.chunkId) ||
           Object.prototype.toString.call(data.buffer) !== '[object ArrayBuffer]')) return;
      if (data.type === 'audio' &&
          (!data.buffer.byteLength || data.buffer.byteLength % 2 !== 0)) {
        const samples = Math.floor(data.buffer.byteLength / 2);
        this.stats.receivedSamples += samples;
        this.stats.rejectedSamples += samples;
        this.report('rejected', { chunkId: data.chunkId, samples });
        return;
      }
      if (data.type === 'clear') {
        if (data.generation < this.generation) return;
        this.stats.clearedSamples += this.queue.queuedSamples;
        this.generation = data.generation;
        this.queue.clear();
        this.failed = false;
        this.report('cleared', { reason: data.reason });
        return;
      }
      if (data.generation !== this.generation) {
        if (data.type === 'audio') {
          this.stats.receivedSamples += data.buffer.byteLength / 2;
          this.stats.rejectedSamples += data.buffer.byteLength / 2;
          this.report('stale', { chunkId: data.chunkId, samples: data.buffer.byteLength / 2 });
        }
        return;
      }
      if (data.type === 'complete') this.queue.completeTurn();
      if (data.type === 'audio') {
        const samples = data.buffer.byteLength / 2;
        this.stats.receivedSamples += samples;
        if (this.failed) {
          this.stats.rejectedSamples += samples;
          this.report('rejected', { chunkId: data.chunkId, samples });
          return;
        }
        if (!this.queue.enqueue(data.buffer)) {
          this.stats.rejectedSamples += samples;
          this.stats.clearedSamples += this.queue.queuedSamples;
          this.queue.clear();
          this.failed = true;
          this.report('overflow', { chunkId: data.chunkId, samples });
        } else {
          this.stats.storedSamples += samples;
          this.report('accepted', { chunkId: data.chunkId, samples });
        }
      }
    };
  }

  report(type, extra = {}) {
    this.port.postMessage({ type, generation: this.generation,
      queueDepthMs: this.queue.queueDepthMs, stats: { ...this.stats }, ...extra });
  }

  process(_inputs, outputs) {
    const channel = outputs[0]?.[0];
    if (!channel) return true;
    const wasStarted = this.queue.started;
    const event = this.queue.render(channel);
    this.stats.playedSamples += this.queue.lastRenderedSamples;
    this.stats.waitingSilenceSamples += this.queue.lastWaitingSilenceSamples;
    if (!wasStarted && this.queue.started) this.report('started');
    if (event && event !== 'started') this.report(event);
    if (this.queue.started && !this.queue.ended) {
      this.reportFrames += channel.length;
      if (this.reportFrames >= this.reportIntervalFrames) {
        this.reportFrames %= this.reportIntervalFrames;
        this.report('stats');
      }
    } else {
      this.reportFrames = 0;
    }
    // This source must remain alive across empty queues and future Gemini turns.
    return true;
  }
}

registerProcessor('audio-output-processor', AudioOutputProcessor);
