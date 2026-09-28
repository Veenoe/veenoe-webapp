/* Bounded 24 kHz PCM queue. The worklet owns the only instance used for playback. */
(function (root) {
  const SAMPLE_RATE_HZ = 24000;
  const START_BUFFER_MS = 100; // Covers small arrival jitter without adding a large speech delay.
  const CAPACITY_MS = 30000; // 1.44 MB maximum backlog; startup remains 100 ms.

  class AudioOutputPipeline {
    constructor() {
      this.samples = new Int16Array(SAMPLE_RATE_HZ * CAPACITY_MS / 1000);
      this.clear();
    }

    get queuedSamples() { return this.length; }
    get queueDepthMs() { return this.length * 1000 / SAMPLE_RATE_HZ; }

    clear() {
      this.head = 0;
      this.length = 0;
      this.started = false;
      this.playing = false;
      this.complete = false;
      this.ended = false;
      this.lastRenderedSamples = 0;
      this.lastWaitingSilenceSamples = 0;
    }

    enqueue(buffer) {
      const bytes = new Uint8Array(buffer);
      // Reject the whole chunk so overflow never overwrites or reorders queued speech.
      if (bytes.length % 2 !== 0 || this.length + bytes.length / 2 > this.samples.length) return false;
      if (this.ended) this.clear();
      for (let i = 0; i < bytes.length; i += 2) {
        const value = bytes[i] | (bytes[i + 1] << 8);
        this.samples[(this.head + this.length++) % this.samples.length] = value >= 0x8000 ? value - 0x10000 : value;
      }
      return true;
    }

    completeTurn() { this.complete = true; }

    render(output) {
      let event = null;
      this.lastRenderedSamples = 0;
      this.lastWaitingSilenceSamples = 0;
      if (this.complete && this.started && !this.playing && this.length === 0 && !this.ended) {
        this.ended = true;
        output.fill(0);
        return 'ended';
      }
      if (!this.started && this.length > 0 &&
          (this.length >= SAMPLE_RATE_HZ * START_BUFFER_MS / 1000 || this.complete)) {
        this.started = true;
        this.playing = true;
        event = 'started';
      }
      let written = 0;
      if (this.playing) {
        const count = Math.min(output.length, this.length);
        for (; written < count; written++) {
          const sample = this.samples[this.head];
          output[written] = sample < 0 ? sample / 32768 : sample / 32767;
          this.head = (this.head + 1) % this.samples.length;
        }
        this.length -= count;
        this.lastRenderedSamples = count;
      }
      for (let i = written; i < output.length; i++) output[i] = 0;
      if (this.started && !this.complete) this.lastWaitingSilenceSamples = output.length - written;
      if (this.playing && this.length === 0) {
        if (this.complete) {
          this.playing = false;
          this.ended = true;
          event = 'ended';
        } else if (written < output.length) {
          this.playing = false;
          event = 'underrun';
        }
      }
      // After an underrun, refill before resuming instead of toggling playback lifecycle.
      if (this.started && !this.playing && this.length > 0 &&
          (this.length >= SAMPLE_RATE_HZ * START_BUFFER_MS / 1000 || this.complete)) {
        this.playing = true;
      }
      return event;
    }
  }

  root.VeenoeAudioOutput = { AudioOutputPipeline, SAMPLE_RATE_HZ, START_BUFFER_MS, CAPACITY_MS };
})(globalThis);
