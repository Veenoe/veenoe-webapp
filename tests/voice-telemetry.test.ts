import test from "node:test";
import assert from "node:assert/strict";
import {
  calculateElapsedMs,
  calculateAverage,
  calculatePacketsPerSecond,
  calculatePcmDurationMs,
  VoiceTelemetry,
} from "../lib/telemetry/voice-telemetry";
import { captureVoiceEvent, initPostHog, sanitizeErrorMessage, posthog } from "../lib/analytics/posthog";

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
  telemetry.onSessionInitStart("models/gemini-2.5-flash", "balanced-v1");
  assert.equal(telemetry.getSnapshot().vadProfile, "balanced-v1");
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
  telemetry.onSessionInitStart("models/gemini-2.5-pro");

  const snap2 = telemetry.getSnapshot();
  // CRITICAL REGRESSION TEST: All session totals must be completely reset to zero
  assert.notEqual(snap2.telemetrySessionId, snap1.telemetrySessionId);
  assert.equal(snap2.modelName, "models/gemini-2.5-pro");
  assert.equal(snap2.vadProfile, null);
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

test("microphone format and pressure diagnostics reset per session", () => {
  const telemetry = new VoiceTelemetry();
  telemetry.onSessionInitStart();
  telemetry.onMicrophoneFormat({
    processingSampleRate: 48000, trackSampleRate: null,
    outputSampleRate: 16000, packetTargetMs: 20, resamplingActive: true
  });
  telemetry.onMicrophoneDrop('worklet_backpressure', 3, { microphoneState: 'active', playbackState: 'idle' }, 4);
  telemetry.onMicrophoneDiagnostics({ requested: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true }, supported: {}, applied: { echoCancellation: false }, capabilities: null });
  telemetry.onMicrophoneLevel({ rmsDbfs: -30, peakDbfs: -10, clippedSampleRatio: 0 });
  telemetry.onMicrophoneError('unavailable');
  assert.equal(telemetry.getSnapshot().microphoneFormat?.processingSampleRate, 48000);
  assert.equal(telemetry.getSnapshot().microphoneDiagnostics?.applied.echoCancellation, false);
  assert.equal(telemetry.getSnapshot().microphoneLevel?.rmsDbfs, -30);
  assert.equal(telemetry.getSnapshot().microphoneErrorCode, 'unavailable');
  assert.equal(telemetry.getSnapshot().connectionErrorCount, 0);
  assert.doesNotMatch(JSON.stringify(telemetry.getSnapshot()), /deviceId|groupId|raw_audio/);
  assert.equal(telemetry.getSnapshot().inputPacketsDropped, 3);
  telemetry.onSessionInitStart();
  assert.equal(telemetry.getSnapshot().microphoneFormat, null);
  assert.equal(telemetry.getSnapshot().microphoneDiagnostics, null);
  assert.equal(telemetry.getSnapshot().microphoneLevel, null);
  assert.equal(telemetry.getSnapshot().microphoneErrorCode, null);
  assert.equal(telemetry.getSnapshot().inputPacketsDropped, 0);
  assert.equal(telemetry.getSnapshot().inputContinuity.dropCounts.worklet_backpressure, 0);
  assert.equal(telemetry.getSnapshot().inputContinuity.recentAnomalies.length, 0);
});

test('input continuity separates drop reasons, intentional mute, and user markers', () => {
  const telemetry = new VoiceTelemetry();
  telemetry.onSessionInitStart();
  const context = { microphoneState: 'active', playbackState: 'playing' };
  telemetry.onMicrophonePacketObserved({ sequence: 1, captureToMainAgeMs: 5 });
  telemetry.onMicrophonePacketObserved({ sequence: 4, captureToMainAgeMs: 12 });
  telemetry.onMicrophoneDrop('worklet_backpressure', 2, context, 4);
  telemetry.onMicrophoneDrop('stale_main', 1, context, 4);
  telemetry.onMicrophoneDrop('transport_unready', 1, context, 5);
  telemetry.onMicrophoneForwardingPaused('muted');
  telemetry.markTurnTakingObservation('replied_too_early', context);
  const snapshot = telemetry.getSnapshot();
  assert.equal(snapshot.inputPacketsDropped, 4);
  assert.equal(snapshot.inputContinuity.maxSequenceGap, 2);
  assert.equal(snapshot.inputContinuity.maxWorkletDropBurst, 2);
  assert.equal(snapshot.inputContinuity.maxCaptureToMainAgeMs, 12);
  assert.deepEqual(snapshot.inputContinuity.dropCounts, {
    worklet_backpressure: 2, stale_main: 1, forwarding_failure: 0,
    transport_unready: 1, send_failure: 0,
  });
  assert.equal(snapshot.inputContinuity.recentAnomalies.at(-1)?.reason, 'replied_too_early');
  assert.equal(snapshot.connectionErrorCount, 0);
  assert.doesNotMatch(JSON.stringify(snapshot), /deviceId|groupId|raw_audio|transcript/);
  for (let index = 0; index < 30; index++) telemetry.onMicrophoneDrop('send_failure', 1, context, index + 6);
  assert.equal(telemetry.getSnapshot().inputContinuity.recentAnomalies.length, 24);
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

test("interrupted turn waits for a correlated clear acknowledgment", () => {
  const telemetry = new VoiceTelemetry();
  telemetry.onSessionInitStart();

  telemetry.onMicrophonePacketSent(256);
  telemetry.onGeminiAudioChunkReceived();
  telemetry.onPlaybackStarted();

  // Gemini sends interruption signal
  telemetry.onInterruptionSignalReceived();
  telemetry.onPlaybackBufferEvent({ type: "clear_requested", generation: 1, reason: "interruption" });
  telemetry.onInterruptionClearRequested();

  const snap = telemetry.getSnapshot();
  assert.equal(snap.lastTurnMetrics?.interrupted, true);
  assert.equal(snap.lastTurnMetrics?.clearRequestToAcknowledgmentMs, null);
  telemetry.onMicrophonePacketSent(256);
  telemetry.onPlaybackBufferEvent({ type: "cleared", generation: 1, reason: "interruption", clearAcknowledgmentMs: 12 });
  assert.equal(telemetry.getSnapshot().lastTurnMetrics?.clearRequestToAcknowledgmentMs, 12);
});

test("first-audio transport turnaround is frozen while the microphone keeps streaming", () => {
  const telemetry = new VoiceTelemetry();
  telemetry.onSessionInitStart();
  telemetry.onMicrophonePacketSent(256);
  telemetry.onGeminiAudioChunkReceived();
  telemetry.onMicrophonePacketSent(256);
  telemetry.onTurnComplete();
  assert.notEqual(telemetry.getSnapshot().lastTurnMetrics?.lastInputPacketToFirstGeminiAudioMs, null);
  assert.equal(telemetry.getSnapshot().lastTurnMetrics?.speechEndToFirstGeminiAudioMs, null);
});

test("interruption without playback leaves playback-stop latency unavailable", () => {
  const telemetry = new VoiceTelemetry();
  telemetry.onSessionInitStart();
  telemetry.onMicrophonePacketSent(256);
  telemetry.onInterruptionSignalReceived();
  telemetry.onInterruptionWithoutPlayback();

  const snap = telemetry.getSnapshot();
  assert.equal(snap.lastTurnMetrics?.interrupted, true);
  assert.equal(snap.lastTurnMetrics?.clearRequestToAcknowledgmentMs, null);
  assert.equal(snap.recentEvents.some(event => event.name === "playback_stopped_interruption"), false);
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

test("playback accounting remains local and resets for the next session", () => {
  const telemetry = new VoiceTelemetry();
  telemetry.onSessionInitStart();
  telemetry.onPlaybackBufferEvent({
    type: 'accepted', generation: 0, chunkId: 1, samples: 2400, queueDepthMs: 100,
    stats: { receivedSamples: 2400, storedSamples: 2400, playedSamples: 0,
      clearedSamples: 0, rejectedSamples: 0, waitingSilenceSamples: 0 },
  });
  const snapshot = telemetry.getSnapshot();
  assert.equal(snapshot.playbackBuffer.stats?.storedSamples, 2400);
  assert.equal(snapshot.playbackBuffer.recentEvents.length, 1);
  telemetry.onPlaybackBufferEvent({ type: 'transferred', generation: 0,
    admissionToTransferMs: 18, capacityWaitMs: 4, conversionTransferMs: 2,
    setupWaitMs: 10, resumeWaitMs: 3 });
  telemetry.onPlaybackBufferEvent({ type: 'started', generation: 0, admissionToFirstRenderMs: 120 });
  assert.equal(telemetry.getSnapshot().playbackBuffer.maxAdmissionToTransferMs, 18);
  assert.equal(telemetry.getSnapshot().playbackBuffer.lastAdmissionToFirstRenderMs, 120);
  assert.equal(JSON.stringify(snapshot.playbackBuffer).includes('deviceId'), false);
  telemetry.onSessionInitStart();
  assert.equal(telemetry.getSnapshot().playbackBuffer.stats, null);
  assert.deepEqual(telemetry.getSnapshot().playbackBuffer.recentEvents, []);
  assert.equal(telemetry.getSnapshot().playbackBuffer.maxAdmissionToTransferMs, null);
});

test("PostHog adapter safely no-ops without credentials", () => {
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

test("privacy guarantees: voice analytics events and snapshots never contain PII, raw errors, audio buffers, or credentials", () => {
  let capturedEvent: string | null = null;
  let capturedPayload: Record<string, unknown> | null = null;

  // Ensure test key is present so posthog is active
  process.env.NEXT_PUBLIC_POSTHOG_KEY = "phc_test_dummy_key";

  // Provide mock window and intercept posthog methods
  const globalObj = globalThis as unknown as Record<string, unknown>;
  const originalWindow = globalObj.window;
  globalObj.window = {};
  const originalInit = posthog.init;
  const originalCapture = posthog.capture;
  const posthogObj = posthog as unknown as Record<string, unknown>;
  posthogObj.init = () => { };
  posthogObj.capture = (event: string, properties: Record<string, unknown>) => {
    capturedEvent = event;
    capturedPayload = properties;
  };

  try {
    // Attempt to pass forbidden fields (PII, raw errors, audio buffers, tokens)
    captureVoiceEvent("voice_connection_error", {
      telemetry_session_id: "anon-uuid-555",
      connection_error_count: 1,
      error_type: "WebSocketError",
      error_category: "gemini_connection",
      model_name: "models/gemini-2.5-flash",
      // Forbidden PII fields:
      user_id: "clerk_user_12345",
      student_name: "Kaushal Kumar",
      email: "kaushal@example.com",
      // Forbidden error/credential fields:
      raw_error: "Connection refused to wss://example.com/socket?key=AIzaSySecret",
      safe_error_message: "Redacted message with key=[REDACTED]",
      error_message: "Fatal socket error",
      token: "secret_ephemeral_token_abc",
      key: "secret_api_key_xyz",
      // Forbidden raw audio fields:
      audio: new Uint8Array([0, 1, 2, 3]),
      raw_audio: new ArrayBuffer(1024),
      transcript: "This was a secret student response",
    } as unknown as Parameters<typeof captureVoiceEvent>[1]);

    assert.equal(capturedEvent, "voice_connection_error");
    assert.ok(capturedPayload !== null);

    // 1. Assert all PII fields are completely stripped
    assert.equal(capturedPayload!["user_id"], undefined);
    assert.equal(capturedPayload!["student_name"], undefined);
    assert.equal(capturedPayload!["email"], undefined);

    // 2. Assert raw and safe error text are completely stripped from PostHog
    assert.equal(capturedPayload!["raw_error"], undefined);
    assert.equal(capturedPayload!["safe_error_message"], undefined);
    assert.equal(capturedPayload!["error_message"], undefined);
    assert.equal(capturedPayload!["token"], undefined);
    assert.equal(capturedPayload!["key"], undefined);

    // 3. Assert raw audio and transcripts are completely stripped
    assert.equal(capturedPayload!["audio"], undefined);
    assert.equal(capturedPayload!["raw_audio"], undefined);
    assert.equal(capturedPayload!["transcript"], undefined);

    // 4. Assert stable technical fields remain intact
    assert.equal(capturedPayload!["telemetry_session_id"], "anon-uuid-555");
    assert.equal(capturedPayload!["connection_error_count"], 1);
    assert.equal(capturedPayload!["error_type"], "WebSocketError");
    assert.equal(capturedPayload!["error_category"], "gemini_connection");
    assert.equal(capturedPayload!["model_name"], "models/gemini-2.5-flash");

    // 5. Assert DiagnosticsSnapshot has no identity fields
    const telemetry = new VoiceTelemetry();
    telemetry.onSessionInitStart("models/gemini-2.5-flash");
    const snapshot = telemetry.getSnapshot();
    const snapshotObj = snapshot as unknown as Record<string, unknown>;
    assert.equal(snapshotObj.userId, undefined);
    assert.equal(snapshotObj.studentName, undefined);
  } finally {
    posthog.capture = originalCapture;
    posthog.init = originalInit;
    if (originalWindow === undefined) {
      delete globalObj.window;
    } else {
      globalObj.window = originalWindow;
    }
  }
});


test("automatic kickoff and initialization-to-first-audio diagnostics are session scoped", () => {
  const telemetry = new VoiceTelemetry();
  telemetry.onSessionInitStart();
  telemetry.onAutomaticKickoff(true);
  telemetry.onGeminiAudioChunkReceived();
  telemetry.onGeminiAudioChunkReceived();
  const events = telemetry.getSnapshot().recentEvents;
  assert.equal(events.filter(event => event.name === "automatic_kickoff_sent").length, 1);
  assert.equal(events.filter(event => event.name === "session_init_to_first_gemini_audio").length, 1);
  telemetry.onSessionInitStart();
  assert.equal(telemetry.getSnapshot().recentEvents.some(event => event.name === "session_init_to_first_gemini_audio"), false);
  telemetry.onAutomaticKickoff(false);
  assert.equal(telemetry.getSnapshot().recentEvents.some(event => event.name === "automatic_kickoff_failed"), true);
});


test("production startup analytics record send outcome, received audio and rendered playback once per session", (t) => {
  const globalObj = globalThis as unknown as Record<string, unknown>;
  const originalWindow = globalObj.window;
  const originalKey = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  globalObj.window = {};
  process.env.NEXT_PUBLIC_POSTHOG_KEY = "phc_test_dummy_key";
  let now = 100;
  t.mock.method(performance, "now", () => now);
  t.mock.method(posthog, "init", () => {});
  const captured: Array<Record<string, unknown>> = [];
  t.mock.method(posthog, "capture", (event: string, properties: Record<string, unknown>) => {
    if (event === "voice_startup") captured.push(properties);
  });

  try {
    const telemetry = new VoiceTelemetry();
    telemetry.onSessionInitStart("gemini-3.8-live", "balanced-v1");
    const firstId = telemetry.getSnapshot().telemetrySessionId;
    now = 120;
    telemetry.onAutomaticKickoff(true);
    telemetry.onAutomaticKickoff(true);
    now = 150;
    telemetry.onGeminiAudioChunkReceived();
    now = 170;
    telemetry.onGeminiAudioChunkReceived();
    telemetry.onPlaybackStarted();
    telemetry.onPlaybackStarted();
    telemetry.onTurnComplete();
    now = 200;
    telemetry.onGeminiAudioChunkReceived();
    telemetry.onPlaybackStarted();
    assert.deepEqual(captured, [
      { telemetry_session_id: firstId, model_name: "gemini-3.8-live", vad_profile: "balanced-v1",
        startup_stage: "kickoff", kickoff_send_accepted: true },
      { telemetry_session_id: firstId, model_name: "gemini-3.8-live", vad_profile: "balanced-v1",
        startup_stage: "first_audio", kickoff_send_accepted: true,
        session_init_to_first_gemini_audio_ms: 50 },
      { telemetry_session_id: firstId, model_name: "gemini-3.8-live", vad_profile: "balanced-v1",
        startup_stage: "first_playback", kickoff_send_accepted: true,
        session_init_to_first_gemini_audio_ms: 50, session_init_to_first_playback_ms: 70 },
    ]);
    telemetry.onSessionEnded();
    telemetry.onSessionEnded();
    assert.equal(captured.length, 3);

    now = 300;
    telemetry.onSessionInitStart();
    const secondId = telemetry.getSnapshot().telemetrySessionId;
    assert.notEqual(secondId, firstId);
    telemetry.onAutomaticKickoff(false);
    telemetry.onAutomaticKickoff(false);
    telemetry.onSessionEnded();
    assert.deepEqual(captured[3], {
      telemetry_session_id: secondId, startup_stage: "kickoff", kickoff_send_accepted: false,
    });
    assert.equal(captured.length, 4);

    now = 400;
    telemetry.onSessionInitStart();
    telemetry.onAutomaticKickoff(true);
    now = 430;
    telemetry.onGeminiAudioChunkReceived();
    now = 440;
    telemetry.onPlaybackStarted();
    assert.equal(captured[5].session_init_to_first_gemini_audio_ms, 30);
    assert.equal(captured[6].session_init_to_first_playback_ms, 40);
    assert.equal(captured.length, 7);
  } finally {
    if (originalWindow === undefined) delete globalObj.window;
    else globalObj.window = originalWindow;
    if (originalKey === undefined) delete process.env.NEXT_PUBLIC_POSTHOG_KEY;
    else process.env.NEXT_PUBLIC_POSTHOG_KEY = originalKey;
  }
});
