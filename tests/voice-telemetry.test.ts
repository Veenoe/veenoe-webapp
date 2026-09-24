import test from "node:test";
import assert from "node:assert/strict";
import {
  calculateElapsedMs,
  calculateAverage,
  calculatePacketsPerSecond,
  calculatePcmDurationMs,
  VoiceTelemetry,
} from "../lib/telemetry/voice-telemetry";
import { captureVoiceEvent, initPostHog, sanitizeErrorMessage, identifyUser } from "../lib/analytics/posthog";

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

test("complete session reset across multiple sessions (no cumulative data leak)", () => {
  const telemetry = new VoiceTelemetry();

  // Session 1: Student conducts an active viva
  telemetry.onSessionInitStart("models/gemini-2.5-flash", "user_123", "Alice");
  telemetry.onMicrophoneReady();
  telemetry.onAudioPlayerReady();
  telemetry.onGeminiConnected();
  telemetry.onGeminiSetupComplete();

  // Stream packets and receive audio
  for (let i = 0; i < 50; i++) {
    telemetry.onMicrophonePacketSent(256);
  }
  telemetry.onGeminiAudioChunkReceived();
  telemetry.onGeminiError(new Error("Transient socket glitch"));
  telemetry.onConnectionRetry(1);
  telemetry.onTurnComplete();

  const snap1 = telemetry.getSnapshot();
  assert.equal(snap1.userId, "user_123");
  assert.equal(snap1.studentName, "Alice");
  assert.equal(snap1.totalInputPackets, 50);
  assert.equal(snap1.totalInputBytes, 12800);
  assert.equal(snap1.totalOutputChunks, 1);
  assert.equal(snap1.connectionErrorCount, 1);
  assert.equal(snap1.connectionRetryCount, 1);
  assert.ok(snap1.connectionSetupMs !== null);
  assert.ok(snap1.lastTurnMetrics !== null);

  telemetry.setIntentionalDisconnect(true);
  telemetry.onSessionEnded();

  // Session 2: Fresh viva started in the same browser tab
  telemetry.onSessionInitStart("models/gemini-2.5-pro", "user_456", "Bob");

  const snap2 = telemetry.getSnapshot();
  // CRITICAL REGRESSION TEST: All session totals must be completely reset to zero
  assert.notEqual(snap2.telemetrySessionId, snap1.telemetrySessionId);
  assert.equal(snap2.userId, "user_456");
  assert.equal(snap2.studentName, "Bob");
  assert.equal(snap2.modelName, "models/gemini-2.5-pro");
  assert.equal(snap2.totalInputPackets, 0);
  assert.equal(snap2.totalInputBytes, 0);
  assert.equal(snap2.totalOutputChunks, 0);
  assert.equal(snap2.disconnectCount, 0);
  assert.equal(snap2.connectionErrorCount, 0);
  assert.equal(snap2.connectionRetryCount, 0);
  assert.equal(snap2.connectionSetupMs, null);
  assert.equal(snap2.lastTurnMetrics, null);
  assert.equal(snap2.currentTurn, 0);
  assert.equal(snap2.recentEvents.length, 1); // Only the new session_init_start
});

test("idempotent onSessionEnded prevents duplicate termination events", () => {
  const telemetry = new VoiceTelemetry();
  telemetry.onSessionInitStart();

  telemetry.onMicrophonePacketSent(256);
  telemetry.onGeminiAudioChunkReceived();

  // First session end (e.g. from finishConclusion)
  telemetry.onSessionEnded();
  const snap1 = telemetry.getSnapshot();
  const eventCount1 = snap1.recentEvents.length;

  // Second session end (e.g. from React component unmount useEffect)
  telemetry.onSessionEnded();
  const snap2 = telemetry.getSnapshot();
  const eventCount2 = snap2.recentEvents.length;

  // Must not record duplicate session_ended events
  assert.equal(eventCount1, eventCount2);
});

test("intentional disconnect does not increment disconnectCount", () => {
  const telemetry = new VoiceTelemetry();
  telemetry.onSessionInitStart();

  // Normal teardown: flag intentional disconnect before closing socket
  telemetry.setIntentionalDisconnect(true);
  telemetry.onGeminiDisconnected();

  const snap = telemetry.getSnapshot();
  assert.equal(snap.disconnectCount, 0); // Must remain 0 for normal shutdown
  assert.equal(snap.recentEvents.some((e) => e.name === "gemini_closed"), true);

  // Unexpected drop: not intentional
  telemetry.setIntentionalDisconnect(false);
  telemetry.onGeminiDisconnected();

  const snapUnexpected = telemetry.getSnapshot();
  assert.equal(snapUnexpected.disconnectCount, 1);
  assert.equal(snapUnexpected.recentEvents.some((e) => e.name === "gemini_disconnected"), true);
});

test("error sanitization strips credentials, tokens, and URLs", () => {
  // Test with dangerous token URL error message
  const dangerousError = new Error(
    "WebSocket failed connecting to wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent?key=AIzaSyA123SecretKey&auth_token=auth_tokens/sample_ephemeral_token_xyz"
  );

  const sanitized = sanitizeErrorMessage(dangerousError);

  assert.equal(sanitized.error_type, "Error");
  assert.equal(sanitized.error_category, "gemini_connection");
  // Must NOT contain the raw API key or token
  assert.ok(!sanitized.safe_message.includes("AIzaSyA123SecretKey"));
  assert.ok(!sanitized.safe_message.includes("sample_ephemeral_token_xyz"));
  assert.ok(sanitized.safe_message.includes("[REDACTED_WS_URL]"));
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

test("PostHog adapter safely no-ops without credentials and supports user identification", () => {
  // Ensure unconfigured environment does not throw
  delete process.env.NEXT_PUBLIC_POSTHOG_KEY;
  const initResult = initPostHog();
  assert.equal(initResult, false);

  // identifyUser and captureVoiceEvent should silently succeed without error
  assert.doesNotThrow(() => {
    identifyUser("user_789", { name: "Charlie" });
    captureVoiceEvent("voice_session_started", {
      telemetry_session_id: "test-session",
      user_id: "user_789",
      student_name: "Charlie",
    });
    captureVoiceEvent("voice_turn_completed", {
      telemetry_session_id: "test-session",
      turn_number: 1,
      input_packet_count: 5,
    });
  });
});
