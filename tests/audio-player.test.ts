import assert from 'node:assert/strict';
import test from 'node:test';
import { AudioPlayer } from '../lib/gemini/audio-player';

function harness() {
  const previousContext = globalThis.AudioContext;
  const previousNode = globalThis.AudioWorkletNode;
  const messages: Array<{ type: string; generation: number; buffer?: ArrayBuffer }> = [];
  const callbacks: string[] = [];
  let resolveResume: (() => void) | undefined;
  let notifyResumeCalled!: () => void;
  const resumeCalled = new Promise<void>(resolve => { notifyResumeCalled = resolve; });
  let nodes = 0;
  let sources = 0;
  let closes = 0;
  let disconnects = 0;
  let portCloses = 0;
  class FakeContext {
    sampleRate = 24000;
    state = 'suspended';
    destination = {};
    audioWorklet = { addModule: async () => {} };
    resume() { return new Promise<void>(resolve => { resolveResume = () => { this.state = 'running'; resolve(); }; notifyResumeCalled(); }); }
    close() { closes++; this.state = 'closed'; return Promise.resolve(); }
    createBufferSource() { sources++; throw new Error('legacy source used'); }
  }
  let fakePort: {
    onmessage: ((event: { data: { type: string; generation: number; queueDepthMs?: number; acceptedBytes?: number } }) => void) | null;
  } | undefined;
  class FakeNode {
    port = {
      onmessage: null as ((event: { data: { type: string; generation: number; queueDepthMs?: number; acceptedBytes?: number } }) => void) | null,
      postMessage: (message: { type: string; generation: number; buffer?: ArrayBuffer }) => { messages.push(message); },
      close: () => { portCloses++; },
    };
    constructor() { nodes++; fakePort = this.port; }
    connect() {}
    disconnect() { disconnects++; }
  }
  globalThis.AudioContext = FakeContext as unknown as typeof AudioContext;
  globalThis.AudioWorkletNode = FakeNode as unknown as typeof AudioWorkletNode;
  const player = new AudioPlayer({
    onPlayStart: () => callbacks.push('start'),
    onPlayEnd: () => callbacks.push('end'),
    onUnderrun: () => callbacks.push('underrun'),
    onAudioScheduled: depth => callbacks.push(`depth:${depth}`),
    onPlaybackError: () => callbacks.push('error'),
  });
  return {
    player, messages, callbacks,
    get nodes() { return nodes; }, get sources() { return sources; },
    get closes() { return closes; }, get disconnects() { return disconnects; }, get portCloses() { return portCloses; },
    resume: async () => { await resumeCalled; resolveResume?.(); },
    waitForResume: () => resumeCalled,
    emit: (type: string, generation = 0, queueDepthMs = 100) => fakePort?.onmessage?.({ data: { type, generation, queueDepthMs, acceptedBytes: 4 } }),
    restore: () => { globalThis.AudioContext = previousContext; globalThis.AudioWorkletNode = previousNode; },
  };
}

const sample = Buffer.from([0, 128, 255, 127]).toString('base64');

test('lazy persistent node enqueues PCM in order and completes only after drain event', async () => {
  const h = harness();
  try {
    await h.player.initialize();
    assert.equal(h.nodes, 0);
    const first = h.player.playAudio(sample);
    const second = h.player.playAudio(sample);
    assert.equal(h.player.hasPendingAudio(), true);
    await h.resume();
    await Promise.all([first, second]);
    assert.equal(h.nodes, 1);
    assert.equal(h.sources, 0);
    assert.deepEqual(h.messages.filter(m => m.type === 'audio').map(m => [...new Uint8Array(m.buffer!)]), [[0, 128, 255, 127], [0, 128, 255, 127]]);
    h.emit('depth');
    h.emit('depth');
    h.emit('started');
    h.player.completeTurn();
    assert.equal(h.messages.at(-1)?.type, 'complete');
    h.emit('ended', 0, 0);
    h.emit('ended', 0, 0);
    assert.equal(h.player.hasPendingAudio(), false);
    assert.deepEqual(h.callbacks, ['depth:100', 'depth:100', 'start', 'end']);
  } finally { h.player.cleanup(); h.restore(); }
  assert.equal(h.closes, 1);
  assert.equal(h.disconnects, 1);
  assert.equal(h.portCloses, 1);
});

test('stop rejects a pending resume and ignores stale worklet events', async () => {
  const h = harness();
  try {
    const pending = h.player.playAudio(sample);
    await h.waitForResume();
    h.player.stop();
    await h.resume();
    await pending;
    assert.equal(h.messages.some(m => m.type === 'audio'), false);
    h.emit('started', 0);
    assert.deepEqual(h.callbacks, []);
    const next = await h.player.playAudio(sample);
    assert.equal(next, undefined);
    assert.equal(h.messages.filter(m => m.type === 'audio').length, 1);
    assert.equal(h.messages.at(-1)?.generation, 1);
  } finally { h.player.cleanup(); h.player.cleanup(); h.restore(); }
  assert.equal(h.closes, 1);
  assert.equal(h.portCloses, 1);
});

test('pending MessagePort audio is bounded before transfer', async () => {
  const h = harness();
  try {
    const tooLarge = h.player.playAudio(Buffer.alloc(24000 * 2 * 4 + 2).toString('base64'));
    await h.resume();
    await tooLarge;
    assert.equal(h.messages.some(message => message.type === 'audio'), false);
    assert.equal(h.messages.at(-1)?.type, 'clear');
    assert.deepEqual(h.callbacks, ['error']);
  } finally { h.player.cleanup(); h.restore(); }
});

test('worklet overflow is terminal for the player', async () => {
  const h = harness();
  try {
    const first = h.player.playAudio(sample);
    await h.resume();
    await first;
    h.emit('overflow');
    await h.player.playAudio(sample);
    assert.equal(h.messages.filter(message => message.type === 'audio').length, 1);
    assert.deepEqual(h.callbacks, ['error']);
  } finally { h.player.cleanup(); h.restore(); }
});
