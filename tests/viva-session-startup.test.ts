import assert from "node:assert/strict";
import test from "node:test";
import { createSessionStartup } from "../lib/hooks/viva/session-startup";
import { GeminiLiveClientSDK } from "../lib/gemini/live-client-sdk";
import { createAudioPipeline } from "../lib/hooks/viva/audio-pipeline";
import { MicrophoneState } from "../types/viva";

function fixture(sendText: (text: string) => boolean = () => true) {
  const sent: string[] = [];
  let pending = false;
  let listening = 0;
  let failures = 0;
  let kickoffs = 0;
  const startup = createSessionStartup({
    sendText: (text) => {
      sent.push(text);
      return sendText(text);
    },
    hasPendingAudio: () => pending,
    onKickoff: () => kickoffs++,
    onFailure: () => failures++,
    onListening: () => listening++,
  });
  return {
    startup,
    sent,
    setPending: (value: boolean) => {
      pending = value;
    },
    counts: () => ({ listening, failures, kickoffs }),
  };
}

for (const completed of [false, true]) {
  test(`recovery releases discarded opening playback, turn complete: ${completed}`, () => {
    const f = fixture();
    f.startup.sessionReady();
    f.startup.setupComplete();
    f.setPending(true);
    if (completed) f.startup.turnComplete();
    f.setPending(false);
    f.startup.connectionRestored();
    f.startup.connectionRestored();
    f.startup.setupComplete();
    f.startup.sessionReady();
    assert.equal(f.counts().listening, 1);
    assert.equal(f.sent.length, 1);
    f.startup.stop();
    f.startup.connectionRestored();
    assert.equal(f.counts().listening, 1);
  });
}

for (const setupFirst of [true, false]) {
  test(`kickoff requires setup and usable session, setup first: ${setupFirst}`, () => {
    const f = fixture();
    const first = setupFirst ? f.startup.setupComplete : f.startup.sessionReady;
    const second = setupFirst
      ? f.startup.sessionReady
      : f.startup.setupComplete;
    first();
    first();
    assert.equal(f.sent.length, 0);
    second();
    second();
    first();
    assert.equal(f.sent.length, 1);
    assert.match(f.sent[0], /Begin the viva now/);
    assert.deepEqual(f.counts(), { listening: 0, failures: 0, kickoffs: 1 });
  });
}

test("recording/forwarding starts only after opening turn and browser queue drain", () => {
  const f = fixture();
  f.startup.sessionReady();
  f.startup.setupComplete();
  f.startup.playbackDrained(); // An underrun is not turn completion.
  assert.equal(f.counts().listening, 0);
  f.setPending(true);
  f.startup.turnComplete();
  assert.equal(f.counts().listening, 0);
  f.setPending(false);
  f.startup.playbackDrained();
  f.startup.playbackDrained();
  f.startup.turnComplete(); // Later normal turns do not restart recording.
  f.startup.setupComplete();
  f.startup.sessionReady(); // Reconnection readiness.
  assert.equal(f.counts().listening, 1);
  assert.equal(f.sent.length, 1);
});

test("playback draining before server completion still waits for turnComplete", () => {
  const f = fixture();
  f.startup.sessionReady();
  f.startup.setupComplete();
  f.startup.playbackDrained();
  assert.equal(f.counts().listening, 0);
  f.startup.turnComplete();
  assert.equal(f.counts().listening, 1);
});

for (const sendText of [
  () => false,
  () => {
    throw new Error("closed");
  },
]) {
  test("failed kickoff abandons initialization without listening or retrying kickoff", () => {
    const f = fixture(sendText);
    f.startup.setupComplete();
    f.startup.sessionReady();
    f.startup.setupComplete();
    f.startup.turnComplete();
    f.startup.playbackDrained();
    assert.deepEqual(f.counts(), { listening: 0, failures: 1, kickoffs: 0 });
    assert.equal(f.sent.length, 1);
  });
}

test("teardown stops delayed readiness and opening completion; new Viva gets a fresh owner", () => {
  for (const ready of [false, true]) {
    const f = fixture();
    if (ready) {
      f.startup.sessionReady();
      f.startup.setupComplete();
    }
    f.startup.stop();
    f.startup.sessionReady();
    f.startup.setupComplete();
    f.startup.turnComplete();
    assert.equal(f.counts().listening, 0);
    assert.equal(f.sent.length, ready ? 1 : 0);
  }
  const next = fixture();
  next.startup.setupComplete();
  next.startup.sessionReady();
  assert.equal(next.sent.length, 1);
});

test("kickoff uses existing generic completed user-content turn with actual SDK wrapper", () => {
  const payloads: unknown[] = [];
  const client = new GeminiLiveClientSDK("auth_tokens/test");
  const internal = client as unknown as {
    session: { sendClientContent: (value: unknown) => void };
    transportOpen: boolean;
    setupReady: boolean;
  };
  internal.session = { sendClientContent: (value) => payloads.push(value) };
  internal.transportOpen = true;
  internal.setupReady = true;
  const f = fixture((text) => client.sendText(text));
  f.startup.setupComplete();
  assert.equal(payloads.length, 0);
  f.startup.sessionReady();
  assert.deepEqual(payloads, [
    {
      turns: [{ role: "user", parts: [{ text: f.sent[0] }] }],
      turnComplete: true,
    },
  ]);
});

test("startup keeps microphone packets out of the existing full-duplex pipeline until listening", () => {
  let microphoneState = MicrophoneState.IDLE;
  let pending = true;
  let packets = 0;
  const pipeline = createAudioPipeline({
    setConversationState: () => {},
    setPlaybackState: () => {},
    isConclusionPendingRef: { current: false },
    isTurnCompleteRef: { current: false },
    isAudioPlayingRef: { current: false },
    finishConclusion: () => {},
  });
  const startup = createSessionStartup({
    sendText: () => true,
    hasPendingAudio: () => pending,
    onKickoff: () => {},
    onFailure: () => assert.fail("unexpected failure"),
    onListening: () => {
      microphoneState = MicrophoneState.ACTIVE;
    },
  });
  const packet = () =>
    pipeline.forwardMicrophoneAudio(
      new ArrayBuffer(640),
      microphoneState,
      false,
      () => {
        packets++;
        return true;
      },
      () => {},
      () => assert.fail("unexpected drop"),
    );
  packet();
  startup.setupComplete();
  startup.sessionReady();
  packet();
  startup.turnComplete();
  packet();
  assert.equal(packets, 0);
  pending = false;
  startup.playbackDrained();
  packet();
  // Normal speaking/playback does not gate microphone forwarding after startup.
  pipeline.createPlaybackCallbacks().onPlayStart?.();
  packet();
  assert.equal(packets, 2);
});
