import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { AudioPlayer, type PlaybackBufferEvent } from '../lib/gemini/audio-player';

type Message = { type: string; generation: number; chunkId?: number; buffer?: ArrayBuffer };
type ProcessorInstance = {
  port: { onmessage: (event: { data: Message }) => void; postMessage: (data: unknown) => void };
  process: (inputs: unknown[], outputs: Float32Array[][]) => boolean;
};

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>(done => { resolve = done; });
  return { promise, resolve };
}

/** Runs the production scripts with asynchronous, explicitly delivered port messages. */
function harness(options: {
  pauseModule?: number; failModule?: number; pauseResume?: boolean;
  observer?: (event: PlaybackBufferEvent) => void;
  onEnd?: (player: AudioPlayer) => void;
  failAudioPost?: boolean;
} = {}) {
  const oldContext = globalThis.AudioContext;
  const oldNode = globalThis.AudioWorkletNode;
  let Processor!: new (options?: { processorOptions?: { generation: number } }) => ProcessorInstance;
  class WorkletBase {
    port = { onmessage: () => {}, postMessage: () => {} };
  }
  const root = {
    Int16Array, Uint8Array, Math, AudioWorkletProcessor: WorkletBase,
    registerProcessor: (_name: string, ctor: typeof Processor) => { Processor = ctor; },
  } as Record<string, unknown>;
  root.globalThis = root;
  for (const file of ['audio-output-pipeline.js', 'audio-output-worklet.js'])
    runInNewContext(readFileSync(new URL(`../public/${file}`, import.meta.url), 'utf8'), root);

  const moduleGate = deferred();
  const resumeGate = deferred();
  const toWorklet: Message[] = [];
  const toPlayer: unknown[] = [];
  const callbacks: string[] = [];
  const events: PlaybackBufferEvent[] = [];
  const contexts: FakeContext[] = [];
  let moduleCalls = 0;
  const nodes: FakeNode[] = [];
  class FakeContext {
    sampleRate = 24000;
    state = 'suspended';
    destination = {};
    closes = 0;
    audioWorklet = { addModule: async () => {
      moduleCalls++;
      if (moduleCalls === options.pauseModule) await moduleGate.promise;
      if (moduleCalls === options.failModule) throw new Error('module unavailable');
    } };
    constructor() { contexts.push(this); }
    async resume() {
      if (options.pauseResume) await resumeGate.promise;
      if (this.state !== 'closed') this.state = 'running';
    }
    async close() { this.closes++; this.state = 'closed'; }
  }
  class FakeNode {
    processor: ProcessorInstance;
    closes = 0;
    disconnects = 0;
    port = {
      onmessage: null as null | ((event: { data: unknown }) => void),
      postMessage: (message: Message) => {
        if (message.type === 'audio' && options.failAudioPost) throw new Error('port failed');
        toWorklet.push(message);
      },
      close: () => { this.closes++; },
    };
    onprocessorerror: (() => void) | null = null;
    constructor(_context: FakeContext, _name: string, nodeOptions: { processorOptions: { generation: number } }) {
      this.processor = new Processor(nodeOptions);
      this.processor.port.postMessage = data => { toPlayer.push(data); };
      nodes.push(this);
    }
    connect() {}
    disconnect() { this.disconnects++; }
  }
  globalThis.AudioContext = FakeContext as unknown as typeof AudioContext;
  globalThis.AudioWorkletNode = FakeNode as unknown as typeof AudioWorkletNode;
  const player = new AudioPlayer({
    onPlayStart: () => callbacks.push('start'),
    onPlayEnd: () => { callbacks.push('end'); options.onEnd?.(player); },
    onPlaybackError: () => callbacks.push('error'),
    onBufferEvent: event => { events.push(event); options.observer?.(event); },
  });
  const deliverWorklet = () => {
    while (toWorklet.length) nodes.at(-1)?.processor.port.onmessage({ data: toWorklet.shift()! });
  };
  const deliverPlayer = () => {
    while (toPlayer.length) nodes.at(-1)?.port.onmessage?.({ data: toPlayer.shift() });
  };
  const render = () => {
    const output = new Float32Array(128);
    nodes.at(-1)?.processor.process([], [[output]]);
    return output;
  };
  const restore = () => {
    player.cleanup();
    globalThis.AudioContext = oldContext;
    globalThis.AudioWorkletNode = oldNode;
  };
  return {
    player, callbacks, events, contexts, toWorklet, toPlayer,
    get node() { return nodes.at(-1) ?? null; },
    get moduleCalls() { return moduleCalls; },
    releaseModule: () => moduleGate.resolve(),
    releaseResume: () => resumeGate.resolve(),
    deliverWorklet, deliverPlayer, render, restore,
  };
}

const pcm = (values: number[]) => {
  const bytes = Buffer.alloc(values.length * 2);
  values.forEach((value, i) => bytes.writeInt16LE(value, i * 2));
  return bytes.toString('base64');
};
const tick = async () => { for (let i = 0; i < 5; i++) await Promise.resolve(); };

test('stop before lazy initialization preserves the next generation and rejects old PCM', async () => {
  const h = harness();
  try {
    h.player.stop();
    h.player.stop();
    const pending = h.player.playAudio(pcm([1000, 2000]));
    await pending;
    h.deliverWorklet();
    h.deliverPlayer();
    h.player.completeTurn();
    h.deliverWorklet();
    const rendered = h.render();
    h.deliverPlayer();
    assert.ok(rendered[0] > 0 && rendered[1] > rendered[0]);
    assert.deepEqual(h.callbacks, ['start', 'end']);
    assert.equal(h.events.some(event => event.type === 'stale'), false);
  } finally { h.restore(); }
});

test('idle completion after clear does not finish the next response', async () => {
  const h = harness();
  try {
    h.player.stop();
    h.player.completeTurn();
    h.player.completeTurn();
    await h.player.playAudio(pcm(Array(2400).fill(1000)));
    h.deliverWorklet();
    h.deliverPlayer();
    for (let i = 0; i < 20; i++) h.render();
    h.deliverPlayer();
    assert.deepEqual(h.callbacks, ['start']);
    h.player.completeTurn();
    h.deliverWorklet();
    h.render();
    h.deliverPlayer();
    assert.deepEqual(h.callbacks, ['start', 'end']);
  } finally { h.restore(); }
});

test('repeated completion after a drained response does not finish fresh audio', async () => {
  const h = harness();
  try {
    await h.player.playAudio(pcm([1000]));
    h.deliverWorklet();
    h.deliverPlayer();
    h.player.completeTurn();
    h.deliverWorklet();
    h.render();
    h.deliverPlayer();
    h.player.completeTurn();
    h.player.completeTurn();
    await h.player.playAudio(pcm(Array(2400).fill(2000)));
    h.deliverWorklet();
    h.deliverPlayer();
    for (let i = 0; i < 20; i++) h.render();
    h.deliverPlayer();
    assert.deepEqual(h.callbacks, ['start', 'end', 'start']);
  } finally { h.restore(); }
});

test('final render accounting is published before onPlayEnd disposes the player', async () => {
  const h = harness({ onEnd: player => player.cleanup() });
  try {
    await h.player.playAudio(pcm([1000, 2000]));
    h.deliverWorklet();
    h.deliverPlayer();
    h.player.completeTurn();
    h.deliverWorklet();
    h.render();
    h.deliverPlayer();
    const ended = h.events.find(event => event.type === 'ended');
    assert.equal(ended?.stats?.storedSamples, 2);
    assert.equal(ended?.stats?.playedSamples, 2);
    assert.equal(ended?.queueDepthMs, 0);
  } finally { h.restore(); }
});

test('playback trace separates admission, setup, transfer, and first render timing', async () => {
  const h = harness();
  try {
    await h.player.playAudio(pcm(Array(2400).fill(1000)));
    const transfer = h.events.find(event => event.type === 'transferred');
    assert.ok(transfer && transfer.admissionToTransferMs! >= 0);
    assert.ok(transfer.setupWaitMs! >= 0);
    assert.ok(transfer.resumeWaitMs! >= 0);
    assert.ok(transfer.conversionTransferMs! >= 0);
    assert.equal(transfer.capacityWaitMs, 0);
    h.deliverWorklet();
    h.deliverPlayer();
    h.render();
    h.deliverPlayer();
    const started = h.events.find(event => event.type === 'started');
    assert.ok(started?.admissionToFirstRenderMs !== undefined);
    assert.ok(started.admissionToFirstRenderMs >= 0);
  } finally { h.restore(); }
});

test('an admitted chunk settles when MessagePort transfer throws', async () => {
  const h = harness({ failAudioPost: true });
  try {
    let settled = false;
    void h.player.playAudio(pcm([1000])).then(() => { settled = true; });
    await tick();
    await tick();
    assert.equal(settled, true);
    assert.deepEqual(h.callbacks, ['error']);
    assert.equal(h.player.hasPendingAudio(), false);
  } finally { h.restore(); }
});

for (const pausedModule of [1, 2]) {
  test(`stop during module ${pausedModule} load admits only fresh PCM`, async () => {
    const h = harness({ pauseModule: pausedModule });
    try {
      const old = h.player.playAudio(pcm([1000]));
      await tick();
      h.player.stop();
      const fresh = h.player.playAudio(pcm([2000]));
      h.releaseModule();
      await Promise.all([old, fresh]);
      h.deliverWorklet();
      h.player.completeTurn();
      h.deliverWorklet();
      const rendered = h.render();
      assert.ok(Math.abs(rendered[0] - 2000 / 32767) < 0.0001);
      assert.equal(h.toWorklet.length, 0);
    } finally { h.restore(); }
  });
}

test('late setup failure from a canceled generation cannot fail the fresh response', async () => {
  const h = harness({ pauseModule: 1, failModule: 1 });
  try {
    const old = h.player.playAudio(pcm([1000]));
    await tick();
    h.player.stop();
    const fresh = h.player.playAudio(pcm([2000]));
    h.releaseModule();
    await Promise.all([old, fresh]);
    h.deliverWorklet();
    h.deliverPlayer();
    h.player.completeTurn();
    h.deliverWorklet();
    assert.ok(h.render()[0] > 0);
    assert.equal(h.callbacks.includes('error'), false);
    assert.equal(h.contexts.length, 2);
    assert.equal(h.contexts[0].closes, 1);
  } finally { h.restore(); }
});

test('cleanup before a queued drain or during module load closes every acquired context once', async () => {
  const h = harness({ pauseModule: 1 });
  try {
    const pending = h.player.playAudio(pcm([1000]));
    h.player.cleanup();
    h.releaseModule();
    await pending;
    await tick();
    h.player.cleanup();
    assert.equal(h.contexts.length, 1);
    assert.equal(h.contexts[0].closes, 1);
    assert.equal(h.node, null);
  } finally { h.restore(); }
});

test('cleanup during resume cannot transfer audio or recreate resources', async () => {
  const h = harness({ pauseResume: true });
  try {
    const pending = h.player.playAudio(pcm([1000]));
    await tick();
    h.player.cleanup();
    h.releaseResume();
    await pending;
    await tick();
    assert.equal(h.contexts[0].closes, 1);
    assert.equal(h.toWorklet.some(message => message.type === 'audio'), false);
    assert.equal(h.node?.closes, 1);
    assert.equal(h.node?.disconnects, 1);
  } finally { h.restore(); }
});

test('interruption during resume releases old payloads and plays the next response', async () => {
  const h = harness({ pauseResume: true });
  try {
    const old = h.player.playAudio(pcm([1000]));
    await tick();
    h.player.stop();
    const fresh = h.player.playAudio(pcm([2000]));
    h.releaseResume();
    await Promise.all([old, fresh]);
    h.deliverWorklet();
    h.deliverPlayer();
    h.player.completeTurn();
    h.deliverWorklet();
    assert.ok(Math.abs(h.render()[0] - 2000 / 32767) < 0.0001);
    assert.equal(h.events.at(-1)?.inFlightBytes, 0);
  } finally { h.restore(); }
});

test('distinct PCM chunks stay ordered and reservations change owners once', async () => {
  const h = harness();
  try {
    const first = h.player.playAudio(pcm([1000, 2000]));
    const second = h.player.playAudio(pcm([3000, 4000]));
    await Promise.all([first, second]);
    assert.equal(h.events.filter(event => event.type === 'transferred').at(-1)?.inFlightBytes, 8);
    h.deliverWorklet();
    h.deliverPlayer();
    assert.equal(h.events.filter(event => event.type === 'accepted').at(-1)?.inFlightBytes, 0);
    h.player.completeTurn();
    h.deliverWorklet();
    const output = h.render();
    for (let i = 0; i < 4; i++)
      assert.ok(Math.abs(output[i] - (i + 1) * 1000 / 32767) < 0.0001);
  } finally { h.restore(); }
});

test('pending resume has a finite admission budget and cancellation releases it', async () => {
  const h = harness({ pauseResume: true });
  try {
    const chunk = pcm(Array(24000).fill(1000));
    const old = h.player.playAudio(chunk);
    await tick();
    for (let i = 0; i < 5; i++) h.player.playAudio(chunk);
    assert.equal(h.callbacks.includes('error'), true);
    h.releaseResume();
    await old;
    await tick();
    assert.equal(h.toWorklet.filter(message => message.type === 'audio').length, 0);
  } finally { h.restore(); }
});

test('asynchronous accepted messages and periodic stats have separate accounting', async () => {
  const h = harness();
  try {
    const first = h.player.playAudio(pcm(Array(24000).fill(1000)));
    await first;
    h.deliverWorklet();
    h.deliverPlayer();
    assert.equal(h.player.hasPendingAudio(), true);
    h.render();
    for (let i = 0; i < 200; i++) h.render();
    h.deliverPlayer();
    const depths = h.events.filter(event => event.type === 'stats').map(event => event.queueDepthMs!);
    assert.ok(depths.length >= 2);
    assert.ok(depths[0] < 1000);
    assert.ok(depths[1] < depths[0]);
    h.player.completeTurn();
    h.deliverWorklet();
    h.render();
    h.deliverPlayer();
    assert.equal(h.player.hasPendingAudio(), false);
  } finally { h.restore(); }
});

test('15 seconds of ordinary queued speech uses the worklet capacity without a four-second total cap', async () => {
  const h = harness();
  try {
    const chunk = pcm(Array(24000).fill(1000));
    for (let i = 0; i < 15; i++) {
      await h.player.playAudio(chunk);
      h.deliverWorklet();
      h.deliverPlayer();
    }
    const latest = h.events.filter(event => event.type === 'accepted').at(-1);
    assert.equal(latest?.queueDepthMs, 15000);
    assert.equal(h.callbacks.includes('error'), false);
    assert.equal(h.player.hasPendingAudio(), true);
  } finally { h.restore(); }
});

test('duplicate acceptance and periodic snapshots never release a later transport reservation', async () => {
  const h = harness();
  try {
    await h.player.playAudio(pcm(Array(2400).fill(1000)));
    h.deliverWorklet();
    const accepted = h.toPlayer[0];
    h.deliverPlayer();
    h.toPlayer.push(accepted, { type: 'stats', generation: 0, queueDepthMs: 90 });
    h.deliverPlayer();
    assert.equal(h.events.filter(event => event.type === 'accepted').length, 1);
    assert.equal(h.player.hasPendingAudio(), true);
  } finally { h.restore(); }
});

test('clear acknowledgment is timed when delivered and stale events cannot restart playback', async () => {
  const h = harness();
  const oldPerformance = globalThis.performance;
  let now = 10;
  Object.defineProperty(globalThis, 'performance', { configurable: true, value: { now: () => now } });
  try {
    await h.player.playAudio(pcm(Array(2400).fill(1000)));
    h.deliverWorklet();
    h.deliverPlayer();
    h.render();
    h.deliverPlayer();
    h.player.stop();
    h.deliverWorklet();
    h.toPlayer.unshift({ type: 'started', generation: 0, queueDepthMs: 100 });
    now = 37;
    h.deliverPlayer();
    assert.equal(h.events.find(event => event.type === 'cleared')?.clearAcknowledgmentMs, 27);
    assert.equal(h.callbacks.filter(callback => callback === 'start').length, 1);
    assert.equal(h.player.hasPendingAudio(), false);
  } finally {
    h.restore();
    Object.defineProperty(globalThis, 'performance', { configurable: true, value: oldPerformance });
  }
});

test('diagnostic observer failure does not block acknowledgment or cleanup', async () => {
  const h = harness({ observer: () => { throw new Error('observer'); } });
  const oldError = console.error;
  console.error = () => {};
  try {
    await h.player.playAudio(pcm(Array(2400).fill(1000)));
    h.deliverWorklet();
    h.deliverPlayer();
    h.player.completeTurn();
    h.deliverWorklet();
    for (let i = 0; i < 20; i++) h.render();
    h.deliverPlayer();
    assert.deepEqual(h.callbacks, ['start', 'end']);
  } finally { h.restore(); console.error = oldError; }
});
