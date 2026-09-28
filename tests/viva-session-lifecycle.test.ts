import assert from "node:assert/strict";
import test from "node:test";
import { applyAbandonOutcome, endSessionForMicrophoneFailure } from "../lib/hooks/viva/session-lifecycle";
import { AudioRecorder, MicrophoneError } from "../lib/gemini/audio-recorder";
import { SessionState } from "../types/viva";

for (const [status, expectedState, expectedPath] of [
  ["abandoned", SessionState.IDLE, "/"],
  ["completed", SessionState.COMPLETED, "/v/session-one"],
] as const) {
  test(`abandon response ${status} follows the authoritative session status`, () => {
    const effects: string[] = [];
    applyAbandonOutcome({ status }, "session-one", {
      setSessionState: (state) => effects.push(`state:${state}`),
      cleanupResources: () => effects.push("cleanup"),
      navigate: (path) => effects.push(`navigate:${path}`),
    });
    assert.deepEqual(effects, [
      `state:${expectedState}`,
      "cleanup",
      `navigate:${expectedPath}`,
    ]);
  });
}

test("active microphone loss stops realtime resources before one abandonment attempt, without a Gemini error", async () => {
  const globals = globalThis as Record<string, unknown>;
  const previousNavigator = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  const previousContext = globals.AudioContext;
  let ended: (() => void) | null = null;
  let stopped = 0;
  let closed = 0;
  const effects: string[] = [];
  const track = {
    readyState: "live", getSettings: () => ({}),
    addEventListener: (_: string, callback: () => void) => { ended = callback; },
    removeEventListener: () => {}, stop: () => { stopped++; },
  };
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: {
    mediaDevices: { getUserMedia: async () => ({ getAudioTracks: () => [track], getTracks: () => [track] }) },
  } });
  globals.AudioContext = class { sampleRate = 48000; audioWorklet = { addModule: async () => {} }; close() { closed++; } };
  try {
    const recorder = new AudioRecorder();
    const handled = { current: false };
    const actions = {
      recordError: (code: string) => effects.push(`mic:${code}`),
      setError: (message: string) => effects.push(`error:${message}`),
      setSessionState: (state: SessionState) => effects.push(`state:${state}`),
      cleanupResources: () => { effects.push("gemini_stopped", "player_stopped"); recorder.cleanup(); },
      abandonSession: async () => { effects.push("abandon_attempt"); throw new Error("offline"); },
    };
    await recorder.initialize(() => endSessionForMicrophoneFailure(new MicrophoneError("ended"), handled, actions));
    (ended as (() => void) | null)?.();
    (ended as (() => void) | null)?.();
    await Promise.resolve();
    assert.deepEqual(effects, [
      "mic:ended", "error:The microphone disconnected. Check the device and start a new session.",
      "state:error", "gemini_stopped", "player_stopped", "abandon_attempt",
    ]);
    assert.deepEqual([stopped, closed], [1, 1]);
    assert.equal(effects.some(event => event.startsWith("gemini_error")), false);
  } finally {
    if (previousNavigator === undefined) delete globals.navigator; else Object.defineProperty(globalThis, "navigator", previousNavigator);
    if (previousContext === undefined) delete globals.AudioContext; else globals.AudioContext = previousContext;
  }
});
