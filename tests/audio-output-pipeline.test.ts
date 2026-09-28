import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const root = { Int16Array, Uint8Array, Math } as Record<string, unknown>;
root.globalThis = root;
runInNewContext(readFileSync(new URL('../public/audio-output-pipeline.js', import.meta.url), 'utf8'), root);
const { AudioOutputPipeline } = root.VeenoeAudioOutput as {
  AudioOutputPipeline: new () => {
    queuedSamples: number; queueDepthMs: number; complete: boolean; started: boolean;
    enqueue: (buffer: ArrayBuffer) => boolean;
    completeTurn: () => void; clear: () => void; render: (output: Float32Array) => string | null;
  };
};
const pcm = (values: number[]) => {
  const bytes = new ArrayBuffer(values.length * 2);
  const view = new DataView(bytes);
  values.forEach((value, index) => view.setInt16(index * 2, value, true));
  return bytes;
};

test('output queue preserves PCM order through partial chunks', () => {
  const queue = new AudioOutputPipeline();
  assert.equal(queue.enqueue(pcm(Array.from({ length: 2399 }, (_, i) => i + 1))), true);
  const first = new Float32Array(128);
  assert.equal(queue.render(first), null);
  assert.equal(first.some(Boolean), false);
  assert.equal(queue.enqueue(pcm([2400, 2401])), true);
  const rendered = new Float32Array(128);
  assert.equal(queue.render(rendered), 'started');
  assert.ok(Math.abs(rendered[0] - 1 / 32767) < 0.00001);
  assert.ok(Math.abs(rendered[127] - 128 / 32767) < 0.00001);
  assert.equal(queue.queuedSamples, 2401 - 128);
});

test('ring wraparound preserves the boundary between old and new chunks', () => {
  const queue = new AudioOutputPipeline();
  queue.enqueue(pcm(Array(720000).fill(1000)));
  const output = new Float32Array(128);
  for (let i = 0; i < 5615; i++) queue.render(output);
  assert.equal(queue.queuedSamples, 1280);
  queue.enqueue(pcm(Array(2400).fill(2000)));
  for (let i = 0; i < 10; i++) {
    queue.render(output);
    assert.ok(Math.abs(output[0] - 1000 / 32767) < 0.00001);
  }
  queue.render(output);
  assert.ok(Math.abs(output[0] - 2000 / 32767) < 0.00001);
});

test('temporary underrun outputs silence and normal completion fires only after turn complete', () => {
  const queue = new AudioOutputPipeline();
  queue.enqueue(pcm(Array(2400).fill(16384)));
  const output = new Float32Array(128);
  assert.equal(queue.render(output), 'started');
  let underruns = 0;
  for (let i = 0; i < 30; i++) if (queue.render(output) === 'underrun') underruns++;
  assert.equal(underruns, 1);
  assert.equal(queue.complete, false);
  assert.equal(output.every(sample => sample === 0), true);
  queue.completeTurn();
  assert.equal(queue.render(output), 'ended');
  assert.equal(queue.render(output), null);
});

test('completion drains a short final chunk and clear prevents stale replay', () => {
  const queue = new AudioOutputPipeline();
  queue.enqueue(pcm([1000, -1000]));
  queue.completeTurn();
  const output = new Float32Array(128);
  assert.equal(queue.render(output), 'ended');
  assert.ok(output[0] > 0 && output[1] < 0);
  queue.clear();
  assert.equal(queue.queuedSamples, 0);
  queue.enqueue(pcm(Array(2400).fill(2000)));
  assert.equal(queue.render(output), 'started');
  assert.ok(output[0] > 0);
});

test('capacity rejects overflow without overwriting queued PCM', () => {
  const queue = new AudioOutputPipeline();
  assert.equal(queue.enqueue(pcm(Array(720000).fill(1234))), true);
  assert.equal(queue.enqueue(pcm([5678])), false);
  assert.equal(queue.queuedSamples, 720000);
  assert.equal(queue.enqueue(new ArrayBuffer(1)), false);
});
