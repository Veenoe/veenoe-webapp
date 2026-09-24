import test from "node:test";
import assert from "node:assert/strict";
import {
  calculateElapsedMs,
  calculateAverage,
  calculatePacketsPerSecond,
  calculatePcmDurationMs,
  VoiceTelemetry,
} from "../lib/telemetry/voice-telemetry";
import { captureVoiceEvent, initPostHog } from "../lib/analytics/posthog";

test("duration calculation with valid timestamps", () => {
  const result = calculateElapsedMs(100.25, 250.75);
  assert.equal(result, 150.5);
});

test("unavailable timestamp handling returns null", () => {
  assert.equal(calculateElapsedMs(null, 100), null);
  assert.equal(calculateElapsedMs(100, null), null);
  assert.equal(calculateElapsedMs(null, null), null);
  // Negative duration (clock anomaly or out-of-order)
  assert.equal(calculateElapsedMs(200, 100), null);
});

test("pure statistics calculations (average, pps, pcm duration)", () => {
  // Average
  assert.equal(calculateAverage(1000, 4), 250);
  assert.equal(calculateAverage(0, 0), null);
  assert.equal(calculateAverage(50, -1), null);

  // Packets per second
  assert.equal(calculatePacketsPerSecond(100, 1000), 100);
  assert.equal(calculatePacketsPerSecond(0, 1000), null);
  assert.equal(calculatePacketsPerSecond(50, 0), null);

  // PCM Duration: 16kHz, 16-bit mono = 32,000 bytes/sec -> 32 bytes/ms
  // 256 bytes = 8 ms
  assert.equal(calculatePcmDurationMs(256), 8);
  assert.equal(calculatePcmDurationMs(0), null);
});

test("session initialization and reset", () => {
  const telemetry = new VoiceTelemetry();
  telemetry.onSessionInitStart("models/gemini-2.5-flash");

  const snap1 = telemetry.getSnapshot();
  assert.equal(snap1.connectionState, "starting");
  assert.equal(snap1.modelName, "models/gemini-2.5-flash");
  assert.equal(snap1.totalInputPackets, 0);

  const firstSessionId = snap1.telemetrySessionId;
  assert.ok(firstSessionId.length > 0);

  // Re-initializing session generates new session ID and resets state
  telemetry.onSessionInitStart("models/gemini-2.5-pro");
  const snap2 = telemetry.getSnapshot();
  assert.notEqual(snap2.telemetrySessionId, firstSessionId);
  assert.equal(snap2.modelName, "models/gemini-2.5-pro");
  assert.equal(snap2.currentTurn, 0);
});

test("microphone transport aggregation without per-packet emission", () => {
  const telemetry = new VoiceTelemetry();
  telemetry.onSessionInitStart();

  // Send 10 packets of 256 bytes each
  for (let i = 0; i < 10; i++) {
    telemetry.onMicrophonePacketSent(256);
  }

  const snap = telemetry.getSnapshot();
  assert.equal(snap.totalInputPackets, 10);
  assert.equal(snap.totalInputBytes, 2560);
  assert.equal(snap.currentTurn, 1);
});

test("turn isolation and no cross-turn metric leakage", () => {
  const telemetry = new VoiceTelemetry();
  telemetry.onSessionInitStart();

  // Turn 1
  telemetry.onMicrophonePacketSent(256);
  telemetry.onMicrophonePacketSent(256);
  telemetry.onGeminiAudioChunkReceived();
  telemetry.onPlaybackStarted();
  telemetry.onTurnComplete();

  const snap1 = telemetry.getSnapshot();
  assert.equal(snap1.lastTurnMetrics?.turnNumber, 1);
  assert.equal(snap1.lastTurnMetrics?.inputPacketCount, 2);
  assert.equal(snap1.lastTurnMetrics?.outputAudioChunkCount, 1);
  assert.equal(snap1.lastTurnMetrics?.interrupted, false);
  // Speech end is honestly unavailable
  assert.equal(snap1.lastTurnMetrics?.speechEndToFirstGeminiAudioMs, null);

  // Turn 2
  telemetry.onMicrophonePacketSent(512);
  telemetry.onGeminiAudioChunkReceived();
  telemetry.onGeminiAudioChunkReceived();
  telemetry.onTurnComplete();

  const snap2 = telemetry.getSnapshot();
  assert.equal(snap2.lastTurnMetrics?.turnNumber, 2);
  assert.equal(snap2.lastTurnMetrics?.inputPacketCount, 1);
  assert.equal(snap2.lastTurnMetrics?.inputBytes, 512);
  assert.equal(snap2.lastTurnMetrics?.outputAudioChunkCount, 2);
});

test("interrupted turn calculates interruption latency and flags turn", () => {
  const telemetry = new VoiceTelemetry();
  telemetry.onSessionInitStart();

  telemetry.onMicrophonePacketSent(256);
  telemetry.onGeminiAudioChunkReceived();
  telemetry.onPlaybackStarted();

  // Gemini sends interruption signal
  telemetry.onInterruptionSignalReceived();
  // Playback is stopped
  telemetry.onPlaybackStoppedDueToInterruption();

  const snap = telemetry.getSnapshot();
  assert.equal(snap.lastTurnMetrics?.interrupted, true);
  assert.ok(snap.lastTurnMetrics?.interruptionToPlaybackStopMs !== null);
  assert.ok(snap.lastTurnMetrics!.interruptionToPlaybackStopMs! >= 0);
});

test("bounded recent event history does not exceed 20 items", () => {
  const telemetry = new VoiceTelemetry();
  telemetry.onSessionInitStart();

  // Generate 35 events
  for (let i = 0; i < 35; i++) {
    telemetry.onMicrophonePacketSent(128);
    telemetry.onGeminiAudioChunkReceived();
    telemetry.onTurnComplete();
  }

  const snap = telemetry.getSnapshot();
  assert.ok(snap.recentEvents.length <= 20);
});

test("PostHog adapter safely no-ops without credentials or in test env", () => {
  // Ensure unconfigured environment does not throw
  delete process.env.NEXT_PUBLIC_POSTHOG_KEY;
  const initResult = initPostHog();
  assert.equal(initResult, false);

  // captureVoiceEvent should silently succeed without error
  assert.doesNotThrow(() => {
    captureVoiceEvent("voice_session_started", {
      telemetry_session_id: "test-session",
    });
    captureVoiceEvent("voice_turn_completed", {
      telemetry_session_id: "test-session",
      turn_number: 1,
      input_packet_count: 5,
    });
  });
});
