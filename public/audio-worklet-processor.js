/** Audio-thread microphone DSP and bounded worklet-to-main handoff. */
class PCMProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const { AudioInputPipeline, OUTPUT_RATE, PACKET_MS, inputLevel } = globalThis.VeenoeAudioInput;
    this.inputLevel = inputLevel;
    this.levelSumSquares = 0;
    this.levelPeak = 0;
    this.levelClipped = 0;
    this.levelCount = 0;
    this.recentLevel = null;
    this.pending = 0;
    this.dropped = 0;
    this.nextPacketSequence = 0;
    this.latestUnsentPacket = null;
    this.pipeline = new AudioInputPipeline(options.processorOptions.sourceRate, (buffer) => {
      const packet = { buffer, createdAtMs: currentTime * 1000, sequence: ++this.nextPacketSequence };
      if (this.pending >= 3) {
        if (this.latestUnsentPacket) this.dropped++;
        this.latestUnsentPacket = packet;
        return;
      }
      this.sendPacket(packet);
    });
    this.port.postMessage({ type: 'format', outputSampleRate: OUTPUT_RATE, packetTargetMs: PACKET_MS });
    this.port.onmessage = (event) => {
      if (event.data === 'ack') {
        this.pending = Math.max(0, this.pending - 1);
        if (this.latestUnsentPacket) {
          const packet = this.latestUnsentPacket;
          this.latestUnsentPacket = null;
          this.sendPacket(packet);
        }
      }
    };
  }

  sendPacket(packet) {
    this.pending++;
    this.port.postMessage({ type: 'audio', ...packet, dropped: this.dropped, ...(this.recentLevel ? { level: this.recentLevel } : {}) }, [packet.buffer]);
    this.recentLevel = null;
    this.dropped = 0;
  }

  process(inputs) {
    // getUserMedia requests one channel; Web Audio channel 0 is the capture contract.
    const channel = inputs[0]?.[0];
    if (channel) {
      for (let i = 0; i < channel.length; i++) {
        const sample = channel[i];
        const absolute = Math.abs(sample);
        this.levelSumSquares += sample * sample;
        this.levelPeak = Math.max(this.levelPeak, absolute);
        if (absolute >= 0.98) this.levelClipped++;
      }
      this.levelCount += channel.length;
      if (this.levelCount >= sampleRate / 2) {
        this.recentLevel = this.inputLevel(this.levelSumSquares, this.levelPeak, this.levelClipped, this.levelCount);
        this.levelSumSquares = this.levelPeak = this.levelClipped = this.levelCount = 0;
      }
      this.pipeline.push(channel);
    }
    return true;
  }
}

registerProcessor('pcm-processor', PCMProcessor);
