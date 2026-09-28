/* Shared by the AudioWorklet and unit tests. No DOM or transport dependencies. */
(function (root) {
  const OUTPUT_RATE = 16000;
  const PACKET_MS = 20;
  const PACKET_SAMPLES = OUTPUT_RATE * PACKET_MS / 1000;
  // 64-tap Hann-windowed sinc: flat through 6 kHz, with useful rejection
  // immediately above the 8 kHz output Nyquist boundary.
  const FILTER_RADIUS = 32;
  const PHASES = 256;

  function pcm16(sample) {
    const clipped = Math.max(-1, Math.min(1, sample));
    return clipped < 0 ? Math.round(clipped * 32768) : Math.round(clipped * 32767);
  }

  function inputLevel(sumSquares, peak, clipped, count) {
    const db = (amplitude) => amplitude > 0 ? Math.max(-120, 20 * Math.log10(amplitude)) : -120;
    return { rmsDbfs: db(Math.sqrt(sumSquares / count)), peakDbfs: db(peak), clippedSampleRatio: clipped / count };
  }

  class AudioInputPipeline {
    constructor(sourceRate, emit) {
      if (!Number.isFinite(sourceRate) || sourceRate <= 0) throw new Error('Invalid source rate');
      this.sourceRate = sourceRate;
      this.emit = emit;
      if (sourceRate !== OUTPUT_RATE) this.weights = this.makeWeights();
      this.reset();
    }

    makeWeights() {
      const weights = new Float32Array((PHASES + 1) * FILTER_RADIUS * 2);
      const cutoff = Math.min(1, OUTPUT_RATE / this.sourceRate) * 0.92;
      for (let phase = 0; phase <= PHASES; phase++) {
        const fraction = phase / PHASES;
        let sum = 0;
        for (let tap = 0; tap < FILTER_RADIUS * 2; tap++) {
          const distance = tap - FILTER_RADIUS + 1 - fraction;
          if (Math.abs(distance) >= FILTER_RADIUS) continue;
          const x = Math.PI * cutoff * distance;
          const sinc = x === 0 ? 1 : Math.sin(x) / x;
          const window = 0.5 + 0.5 * Math.cos(Math.PI * distance / FILTER_RADIUS);
          const weight = cutoff * sinc * window;
          weights[phase * FILTER_RADIUS * 2 + tap] = weight;
          sum += weight;
        }
        for (let tap = 0; tap < FILTER_RADIUS * 2; tap++) {
          weights[phase * FILTER_RADIUS * 2 + tap] /= sum;
        }
      }
      return weights;
    }

    reset() {
      this.inputCount = 0;
      this.outputCount = 0;
      this.ring = new Float32Array(128);
      this.packet = new Float32Array(PACKET_SAMPLES);
      this.packetLength = 0;
    }

    push(input) {
      if (this.sourceRate === OUTPUT_RATE) {
        for (let i = 0; i < input.length; i++) this.addOutput(input[i]);
        return;
      }
      for (let i = 0; i < input.length; i++) {
        this.ring[this.inputCount % this.ring.length] = input[i];
        this.inputCount++;
        // Absolute output positions prevent block-boundary rounding drift.
        while (this.outputCount * this.sourceRate / OUTPUT_RATE + FILTER_RADIUS < this.inputCount) {
          const position = this.outputCount * this.sourceRate / OUTPUT_RATE;
          const center = Math.floor(position);
          const phase = Math.round((position - center) * PHASES);
          const weightOffset = phase * FILTER_RADIUS * 2;
          let sum = 0;
          for (let tap = 0; tap < FILTER_RADIUS * 2; tap++) {
            const sourceIndex = center + tap - FILTER_RADIUS + 1;
            if (sourceIndex >= 0) sum += this.ring[sourceIndex % this.ring.length] * this.weights[weightOffset + tap];
          }
          this.addOutput(sum);
          this.outputCount++;
        }
      }
    }

    addOutput(sample) {
      this.packet[this.packetLength++] = sample;
      if (this.packetLength !== PACKET_SAMPLES) return;
      const buffer = new ArrayBuffer(PACKET_SAMPLES * 2);
      const view = new DataView(buffer);
      for (let i = 0; i < PACKET_SAMPLES; i++) view.setInt16(i * 2, pcm16(this.packet[i]), true);
      this.packetLength = 0;
      this.emit(buffer);
    }
  }

  root.VeenoeAudioInput = { AudioInputPipeline, OUTPUT_RATE, PACKET_MS, PACKET_SAMPLES, pcm16, inputLevel };
})(globalThis);
