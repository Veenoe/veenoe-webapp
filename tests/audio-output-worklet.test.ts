import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const messages: Array<{ type: string; generation: number }> = [];
let Processor!: new () => {
  port: { onmessage: (event: { data: unknown }) => void };
  process: (inputs: unknown[], outputs: Float32Array[][]) => boolean;
};
class WorkletBase {
  port = {
    onmessage: () => {},
    postMessage: (message: { type: string; generation: number }) => messages.push(message),
  };
}
const root = {
  Int16Array, Uint8Array, Math,
  AudioWorkletProcessor: WorkletBase,
  registerProcessor: (_name: string, ctor: typeof Processor) => { Processor = ctor; },
} as Record<string, unknown>;
root.globalThis = root;
for (const file of ['audio-output-pipeline.js', 'audio-output-worklet.js']) {
  runInNewContext(readFileSync(new URL(`../public/${file}`, import.meta.url), 'utf8'), root);
}
const pcm = (length: number) => new Int16Array(Array(length).fill(1000)).buffer;

test('production worklet starts once, clears by generation and reports drain once', () => {
  messages.length = 0;
  const processor = new Processor();
  const send = (data: unknown) => processor.port.onmessage({ data });
  const render = () => {
    const output = new Float32Array(128);
    assert.equal(processor.process([], [[output]]), true);
    return output;
  };
  send({ type: 'audio', generation: 0, buffer: pcm(2400) });
  assert.ok(render()[0] > 0);
  assert.equal(messages.filter(m => m.type === 'started').length, 1);
  send({ type: 'clear', generation: 1 });
  assert.equal(render().every(sample => sample === 0), true);
  send({ type: 'audio', generation: 0, buffer: pcm(2400) });
  assert.equal(render().every(sample => sample === 0), true);
  send({ type: 'audio', generation: 1, buffer: pcm(2) });
  send({ type: 'complete', generation: 1 });
  assert.ok(render()[0] > 0);
  assert.equal(messages.filter(m => m.type === 'ended' && m.generation === 1).length, 1);
  render();
  assert.equal(messages.filter(m => m.type === 'ended').length, 1);
});

test('production worklet overflow clears and ignores subsequent audio until reset', () => {
  messages.length = 0;
  const processor = new Processor();
  const send = (data: unknown) => processor.port.onmessage({ data });
  send({ type: 'audio', generation: 0, buffer: pcm(96000) });
  send({ type: 'audio', generation: 0, buffer: pcm(1) });
  send({ type: 'audio', generation: 0, buffer: pcm(2400) });
  const output = new Float32Array(128);
  processor.process([], [[output]]);
  assert.equal(output.every(sample => sample === 0), true);
  assert.equal(messages.filter(m => m.type === 'overflow').length, 1);
  send({ type: 'clear', generation: 1 });
  send({ type: 'audio', generation: 1, buffer: pcm(2400) });
  processor.process([], [[output]]);
  assert.ok(output[0] > 0);
});
