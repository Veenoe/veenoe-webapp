import assert from 'node:assert/strict';
import test from 'node:test';
import { AudioRecorder, handleWorkletAudioMessage } from '../lib/gemini/audio-recorder';

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
    await assert.rejects(recorder.startRecording(() => {}), /graph construction failed/);
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
