import assert from 'node:assert/strict';
import test from 'node:test';
import { AudioRecorder, captureMicrophoneDiagnostics, handleWorkletAudioMessage } from '../lib/gemini/audio-recorder';

test('capture diagnostics uses reported settings and omits identifiers', () => {
  const track = {
    getSettings: () => ({ sampleRate: 44100, channelCount: 2, echoCancellation: false, deviceId: 'secret', groupId: 'secret' }),
    getCapabilities: () => ({ channelCount: { min: 1, max: 2 }, deviceId: 'secret' }),
  } as unknown as MediaStreamTrack;
  const devices = { getSupportedConstraints: () => ({ echoCancellation: true, noiseSuppression: true, deviceId: true }) } as MediaDevices;
  const result = captureMicrophoneDiagnostics(track, devices);
  assert.equal(result.requested.echoCancellation, true);
  assert.equal(result.applied.echoCancellation, false);
  assert.equal(result.applied.noiseSuppression, undefined);
  assert.equal(result.supported.autoGainControl, undefined);
  assert.equal(result.applied.channelCount, 2);
  assert.equal(result.capabilities?.channelCount?.max, 2);
  assert.doesNotMatch(JSON.stringify(result), /deviceId|groupId|secret/);
  const withoutCapabilities = captureMicrophoneDiagnostics({ getSettings: () => ({}) } as MediaStreamTrack, devices);
  assert.equal(withoutCapabilities.capabilities, null);
});

test('microphone initialization classifies browser failures and cleans partial resources', async () => {
  const globals = globalThis as Record<string, unknown>;
  const previousNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  const previousContext = globals.AudioContext;
  let stopped = 0;
  let closed = 0;
  let listener: (() => void) | null = null;
  let requested: MediaStreamConstraints | null = null;
  const track = {
    readyState: 'live', getSettings: () => ({ sampleRate: 48000 }),
    addEventListener: (_: string, callback: () => void) => { listener = callback; },
    removeEventListener: () => { listener = null; }, stop: () => { stopped++; },
  };
  const stream = { getAudioTracks: () => [track], getTracks: () => [track] };
  const devices = { getSupportedConstraints: () => ({}), getUserMedia: async (constraints?: MediaStreamConstraints) => { requested = constraints ?? null; return stream; } };
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { mediaDevices: devices } });
  globals.AudioContext = class {
    sampleRate = 48000;
    audioWorklet = { addModule: async () => {} };
    close() { closed++; }
  };
  try {
    const recorder = new AudioRecorder();
    await recorder.initialize();
    assert.deepEqual((requested as MediaStreamConstraints | null)?.audio,
      { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true });
    recorder.cleanup();
    assert.equal(listener, null);
    assert.equal(stopped, 1);
    assert.equal(closed, 1);

    for (const [name, code] of [['NotAllowedError', 'permission_denied'], ['SecurityError', 'unsupported'], ['NotFoundError', 'not_found'],
      ['NotReadableError', 'unavailable'], ['OverconstrainedError', 'constraint']] as const) {
      devices.getUserMedia = async () => { throw Object.assign(new Error('private browser details'), { name }); };
      await assert.rejects(new AudioRecorder().initialize(), { code });
    }
    devices.getUserMedia = async () => stream;
    globals.AudioContext = class { constructor() { throw new Error('private worklet details'); } };
    await assert.rejects(new AudioRecorder().initialize(), { code: 'processing' });
    assert.equal(stopped, 2);
  } finally {
    if (previousNavigator === undefined) delete globals.navigator; else Object.defineProperty(globalThis, 'navigator', previousNavigator);
    if (previousContext === undefined) delete globals.AudioContext; else globals.AudioContext = previousContext;
  }
});

test('unexpected track end cleans recorder once and notifies owner', async () => {
  const globals = globalThis as Record<string, unknown>;
  const oldNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  const oldContext = globals.AudioContext;
  let ended: (() => void) | null = null;
  let stops = 0;
  let closes = 0;
  let notified = 0;
  const track = { readyState: 'live', getSettings: () => ({}), addEventListener: (_: string, cb: () => void) => { ended = cb; }, removeEventListener: () => {}, stop: () => { stops++; } };
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { mediaDevices: { getUserMedia: async () => ({ getAudioTracks: () => [track], getTracks: () => [track] }) } } });
  globals.AudioContext = class { sampleRate = 48000; audioWorklet = { addModule: async () => {} }; close() { closes++; } };
  try {
    const recorder = new AudioRecorder();
    await recorder.initialize(() => { notified++; });
    (ended as (() => void) | null)?.();
    recorder.cleanup();
    assert.deepEqual([notified, stops, closes], [1, 1, 1]);
    assert.equal(recorder.getMicrophoneDiagnostics(), null);
  } finally {
    if (oldNavigator === undefined) delete globals.navigator; else Object.defineProperty(globalThis, 'navigator', oldNavigator);
    if (oldContext === undefined) delete globals.AudioContext; else globals.AudioContext = oldContext;
  }
});

test('stale packets are dropped, fresh packets forward, and all are acknowledged', () => {
  const packet = { type: 'audio' as const, buffer: new ArrayBuffer(640), dropped: 0, createdAtMs: 100 };
  let sent = 0;
  let dropped = 0;
  let acknowledged = 0;
  const forward = () => { sent++; };
  const drop = (count: number) => { dropped += count; };
  const ack = () => { acknowledged++; };
  handleWorkletAudioMessage(packet, 199, forward, drop, ack);
  assert.deepEqual([sent, dropped, acknowledged], [1, 0, 1]);
  handleWorkletAudioMessage(packet, 201, forward, drop, ack);
  assert.deepEqual([sent, dropped, acknowledged], [1, 1, 2]);
  handleWorkletAudioMessage({ ...packet, dropped: 2 }, 199,
    () => { throw new Error('SDK send failed'); }, drop, ack);
  assert.deepEqual([sent, dropped, acknowledged], [1, 4, 3]);
  handleWorkletAudioMessage({ ...packet, level: { rmsDbfs: -30, peakDbfs: -10, clippedSampleRatio: 0 } }, 199,
    forward, drop, ack, () => { throw new Error('diagnostics failed'); });
  assert.deepEqual([sent, dropped, acknowledged], [2, 4, 4]);
});

test('recorder rolls back a partially connected graph', async () => {
  const previous = (globalThis as Record<string, unknown>).AudioWorkletNode;
  let sourceDisconnected = false;
  let nodeDisconnected = false;
  let portClosed = false;
  (globalThis as Record<string, unknown>).AudioWorkletNode = class {
    port = { close: () => { portClosed = true; } };
    disconnect() { nodeDisconnected = true; }
  };
  try {
    const recorder = new AudioRecorder();
    const internal = recorder as unknown as { audioContext: AudioContext; mediaStream: MediaStream; isRecording: boolean; sourceNode: unknown };
    internal.audioContext = {
      state: 'running', sampleRate: 48000,
      createMediaStreamSource: () => ({ connect: () => {}, disconnect: () => { sourceDisconnected = true; } }),
      createGain: () => { throw new Error('graph construction failed'); },
    } as unknown as AudioContext;
    internal.mediaStream = {} as MediaStream;
    await assert.rejects(recorder.startRecording(() => {}), { name: 'MicrophoneError', code: 'processing' });
    assert.equal(internal.isRecording, false);
    assert.equal(internal.sourceNode, null);
    assert.equal(sourceDisconnected, true);
    assert.equal(nodeDisconnected, true);
    assert.equal(portClosed, true);
  } finally {
    if (previous === undefined) delete (globalThis as Record<string, unknown>).AudioWorkletNode;
    else (globalThis as Record<string, unknown>).AudioWorkletNode = previous;
  }
});
