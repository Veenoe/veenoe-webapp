/** Audio-thread microphone DSP and bounded worklet-to-main handoff. */
class PCMProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const { AudioInputPipeline, OUTPUT_RATE, PACKET_MS } = globalThis.VeenoeAudioInput;
    this.pending = 0;
    this.dropped = 0;
    this.latestUnsentPacket = null;
    this.pipeline = new AudioInputPipeline(options.processorOptions.sourceRate, (buffer) => {
      const packet = { buffer, createdAtMs: currentTime * 1000 };
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
    this.port.postMessage({ type: 'audio', ...packet, dropped: this.dropped }, [packet.buffer]);
    this.dropped = 0;
  }

  process(inputs) {
    // getUserMedia requests one channel; Web Audio channel 0 is the capture contract.
    // Device/channel downmix policy belongs to VEENOE-21.
    const channel = inputs[0]?.[0];
    if (channel) this.pipeline.push(channel);
    return true;
  }
}

registerProcessor('pcm-processor', PCMProcessor);
