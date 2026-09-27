import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

// Evaluate the exact static scripts loaded by AudioWorklet.addModule.
const root = { ArrayBuffer, DataView, Float32Array, Math } as Record<string, unknown>;
root.globalThis = root;
runInNewContext(readFileSync(new URL('../public/audio-input-pipeline.js', import.meta.url), 'utf8'), root);
const audio = root.VeenoeAudioInput as {
  AudioInputPipeline: new (rate: number, emit: (packet: ArrayBuffer) => void) => {
    push(input: Float32Array): void; reset(): void;
  };
  pcm16: (sample: number) => number;
};

function stream(rate: number, length: number, blocks: number[]) {
  const packets: ArrayBuffer[] = [];
  const pipeline = new audio.AudioInputPipeline(rate, (packet) => packets.push(packet));
  let offset = 0;
  let block = 0;
  while (offset < length) {
    const count = Math.min(blocks[block++ % blocks.length], length - offset);
    const samples = new Float32Array(count);
    for (let i = 0; i < count; i++) samples[i] = Math.sin(2 * Math.PI * 440 * (offset + i) / rate);
    pipeline.push(samples);
    offset += count;
  }
  return { packets, pipeline };
}

test('pass-through packets are exact 20 ms PCM16 and preserve remainders', () => {
  const packets: ArrayBuffer[] = [];
  const pipeline = new audio.AudioInputPipeline(16000, (packet) => packets.push(packet));
  pipeline.push(new Float32Array(319));
  assert.equal(packets.length, 0);
  pipeline.push(new Float32Array(1));
  assert.equal(packets.length, 1);
  assert.equal(packets[0].byteLength, 640);
  pipeline.push(new Float32Array(640));
  assert.equal(packets.length, 3);
  pipeline.push(new Float32Array(17));
  pipeline.reset();
  pipeline.push(new Float32Array(303));
  assert.equal(packets.length, 3);
  pipeline.push(new Float32Array(17));
  assert.equal(packets.length, 4);
});

for (const rate of [16000, 32000, 44100, 48000]) {
  test(`${rate} Hz output count is stable over varying blocks and long streams`, () => {
    const seconds = 12;
    const a = stream(rate, rate * seconds, [1, 17, 128, 511, 7]);
    const b = stream(rate, rate * seconds, [2048]);
    assert.equal(a.packets.length, b.packets.length);
    const expected = Math.floor((rate * seconds - (rate === 16000 ? 0 : 16)) * 16000 / rate / 320);
    assert.ok(Math.abs(a.packets.length - expected) <= 1);
    assert.ok(a.packets.every((packet) => packet.byteLength === 640));
    assert.deepEqual(Buffer.from(a.packets[10]), Buffer.from(b.packets[10]));
  });
}

test('PCM16 is clipped and encoded little-endian', () => {
  const packets: ArrayBuffer[] = [];
  const pipeline = new audio.AudioInputPipeline(16000, (packet) => packets.push(packet));
  const samples = new Float32Array(320);
  samples.set([-2, -1, -0.5, 0, 0.5, 1, 2]);
  pipeline.push(samples);
  const view = new DataView(packets[0]);
  assert.deepEqual(Array.from({ length: 7 }, (_, i) => view.getInt16(i * 2, true)),
    [-32768, -32768, -16384, 0, 16384, 32767, 32767]);
  assert.deepEqual(Array.from(new Uint8Array(packets[0], 0, 8)), [0, 128, 0, 128, 0, 192, 0, 0]);
});

test('downsampling attenuates speech-band aliases and reset clears resampler state', () => {
  const rms = (frequency: number) => {
    const packets: ArrayBuffer[] = [];
    const pipeline = new audio.AudioInputPipeline(48000, (packet) => packets.push(packet));
    const input = new Float32Array(4800);
    for (let i = 0; i < input.length; i++) input[i] = Math.sin(2 * Math.PI * frequency * i / 48000);
    pipeline.push(input);
    const view = new DataView(packets[1]);
    return Math.sqrt(Array.from({ length: 320 }, (_, i) => (view.getInt16(i * 2, true) / 32768) ** 2)
      .reduce((a, b) => a + b, 0) / 320);
  };
  const reference = rms(1000);
  const attenuationDb = (frequency: number) => 20 * Math.log10(rms(frequency) / reference);
  for (const frequency of [4000, 6000]) assert.ok(attenuationDb(frequency) > -1);
  assert.ok(attenuationDb(7000) > -4);
  assert.ok(attenuationDb(8200) < -20);
  assert.ok(attenuationDb(9000) < -35);
  assert.ok(attenuationDb(10000) < -55);
  assert.ok(attenuationDb(12000) < -55);
  const packets: ArrayBuffer[] = [];
  const pipeline = new audio.AudioInputPipeline(44100, (packet) => packets.push(packet));
  pipeline.push(new Float32Array(1000).fill(0.75));
  pipeline.reset();
  pipeline.push(new Float32Array(1000));
  assert.ok(packets.length >= 1);
  assert.ok(Array.from(new Uint8Array(packets.at(-1)!)).every((byte) => byte === 0));
});

test('worklet handoff retains the freshest packet while keeping three in flight', () => {
  const sent: Array<{ type: string; buffer?: ArrayBuffer; dropped?: number; outputSampleRate?: number; packetTargetMs?: number }> = [];
  let processor: { pipeline: { push(input: Float32Array): void }; port: { onmessage: (e: { data: string }) => void } } | null = null;
  class Base {
    port = { postMessage: (value: { type: string; buffer?: ArrayBuffer; dropped?: number }) => sent.push(value), onmessage: () => { } };
  }
  const scope: Record<string, unknown> = {
    ...root, AudioWorkletProcessor: Base, currentTime: 0,
    registerProcessor: (_name: string, ctor: new (options: unknown) => typeof processor) => {
      processor = new ctor({ processorOptions: { sourceRate: 16000 } });
    }
  };
  scope.globalThis = scope;
  runInNewContext(readFileSync(new URL('../public/audio-worklet-processor.js', import.meta.url), 'utf8'), scope);
  const worklet = processor!;
  assert.equal(sent[0].type, 'format');
  assert.equal(sent[0].outputSampleRate, 16000);
  assert.equal(sent[0].packetTargetMs, 20);
  for (let i = 1; i <= 6; i++) worklet.pipeline.push(new Float32Array(320).fill(i / 10));
  assert.equal(sent.filter((message) => message.type === 'audio').length, 3);
  assert.ok(sent.slice(1, 4).every((message) => message.dropped === 0));
  worklet.port.onmessage({ data: 'ack' });
  assert.equal(sent[4].type, 'audio');
  assert.equal(sent[4].dropped, 2);
  assert.equal(new DataView(sent[4].buffer!).getInt16(0, true), Math.round(0.6 * 32767));
  worklet.pipeline.push(new Float32Array(320).fill(0.7));
  assert.equal(sent.length, 5);
  worklet.port.onmessage({ data: 'ack' });
  assert.equal(sent[5].dropped, 0);
  assert.equal(new DataView(sent[5].buffer!).getInt16(0, true), Math.round(0.7 * 32767));
});
