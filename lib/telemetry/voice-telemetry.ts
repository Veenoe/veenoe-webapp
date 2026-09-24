/**
 * Voice Telemetry Abstraction for Veenoe Voice v2 (VEENOE-16)
 *
 * Provides:
 * 1. Monotonic performance.now() elapsed timings.
 * 2. High-frequency audio packet metric aggregation without React re-render overhead.
 * 3. Lifecycle event tracking and bounded recent event history for developer diagnostics.
 * 4. Per-turn metric isolation and derivation.
 * 5. Safe PostHog product analytics emission.
 * 6. Zero PII, zero audio, zero tokens.
 */

import { captureVoiceEvent, VoiceEventProperties } from "../analytics/posthog";

export interface DiagnosticEventItem {
  id: string;
  name: string;
  relTimeMs: number;
  wallClock: string;
  detail?: string;
}

export interface TurnMetricsSnapshot {
  turnNumber: number;
  speechEndToFirstGeminiAudioMs: number | null; // Currently unavailable (no client VAD)
  lastInputPacketToFirstGeminiAudioMs: number | null; // Honest proxy metric
  firstGeminiAudioToPlaybackMs: number | null;
  speechEndToFirstPlaybackMs: number | null; // Currently unavailable
  interruptionToPlaybackStopMs: number | null;
  inputPacketCount: number;
  inputBytes: number;
  averagePacketBytes: number | null;
  averagePacketIntervalMs: number | null;
  packetsPerSecond: number | null;
  estimatedPacketDurationMs: number | null;
  outputAudioChunkCount: number;
  maxPlaybackQueueMs: number | null;
  playbackUnderrunCount: number;
  interrupted: boolean;
}

export interface DiagnosticsSnapshot {
  telemetrySessionId: string;
  connectionState: "idle" | "starting" | "connected" | "disconnected" | "error";
  connectionSetupMs: number | null;
  currentTurn: number;
  modelName: string | null;
  lastTurnMetrics: TurnMetricsSnapshot | null;
  // Session totals
  totalInputPackets: number;
  totalInputBytes: number;
  totalOutputChunks: number;
  disconnectCount: number;
  connectionErrorCount: number;
  reconnectAttemptCount: number;
  recentEvents: DiagnosticEventItem[];
}

/**
 * Pure calculation functions for telemetry metrics.
 * Easily unit-testable without mocks or DOM dependencies.
 */
export function calculateElapsedMs(
  startTime: number | null,
  endTime: number | null
): number | null {
  if (startTime === null || endTime === null || endTime < startTime) {
    return null;
  }
  return Math.round((endTime - startTime) * 100) / 100;
}

export function calculateAverage(total: number, count: number): number | null {
  if (count <= 0) return null;
  return Math.round((total / count) * 100) / 100;
}

export function calculatePacketsPerSecond(
  packetCount: number,
  durationMs: number | null
): number | null {
  if (!durationMs || durationMs <= 0 || packetCount <= 0) return null;
  return Math.round((packetCount / (durationMs / 1000)) * 10) / 10;
}

export function calculatePcmDurationMs(
  bytes: number,
  sampleRate = 16000,
  bytesPerSample = 2,
  channels = 1
): number | null {
  if (bytes <= 0 || sampleRate <= 0) return null;
  const bytesPerSecond = sampleRate * bytesPerSample * channels;
  return Math.round((bytes / bytesPerSecond) * 1000 * 100) / 100;
}

export function generateAnonymousSessionId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return "viva-" + Math.random().toString(36).substring(2, 15) + Date.now().toString(36);
}

const MAX_RECENT_EVENTS = 20;

export class VoiceTelemetry {
  private sessionId: string;
  private sessionStartTime: number;
  private connectionState: "idle" | "starting" | "connected" | "disconnected" | "error" = "idle";
  private modelName: string | null = null;

  // Connection Timestamps
  private sessionInitStartTime: number | null = null;
  private micInitTime: number | null = null;
  private playerInitTime: number | null = null;
  private geminiConnectedTime: number | null = null;
  private geminiSetupCompleteTime: number | null = null;
  private connectionSetupMs: number | null = null;

  // Session-wide counters
  private totalInputPackets = 0;
  private totalInputBytes = 0;
  private totalOutputChunks = 0;
  private disconnectCount = 0;
  private connectionErrorCount = 0;
  private reconnectAttemptCount = 0;

  // Turn-level state
  private currentTurn = 0;
  private turnInputPacketCount = 0;
  private turnInputBytes = 0;
  private turnFirstPacketTime: number | null = null;
  private turnLastPacketTime: number | null = null;
  private turnPacketIntervalSum = 0;
  private turnPacketIntervalCount = 0;
  private turnFirstGeminiAudioTime: number | null = null;
  private turnFirstPlaybackScheduledTime: number | null = null;
  private turnFirstPlaybackStartTime: number | null = null;
  private turnOutputChunkCount = 0;
  private turnInterruptedTime: number | null = null;
  private turnPlaybackStoppedTime: number | null = null;
  private turnPlaybackUnderruns = 0;
  private turnMaxPlaybackQueueMs: number | null = null;
  private turnIsInterrupted = false;

  private lastCompletedTurnMetrics: TurnMetricsSnapshot | null = null;

  // Bounded timeline for diagnostics
  private recentEvents: DiagnosticEventItem[] = [];

  // Listeners for diagnostics UI updates
  private listeners = new Set<() => void>();

  constructor() {
    this.sessionId = generateAnonymousSessionId();
    this.sessionStartTime = typeof performance !== "undefined" ? performance.now() : Date.now();
  }

  public subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notifyListeners(): void {
    for (const listener of this.listeners) {
      try {
        listener();
      } catch (err) {
        console.error("[VoiceTelemetry] Listener error:", err);
      }
    }
  }

  private recordDiagnosticEvent(name: string, detail?: string): void {
    const now = typeof performance !== "undefined" ? performance.now() : Date.now();
    const relTimeMs = Math.round(now - this.sessionStartTime);
    const wallClock = new Date().toLocaleTimeString();

    const item: DiagnosticEventItem = {
      id: `${name}-${now}-${Math.random().toString(36).slice(2, 7)}`,
      name,
      relTimeMs,
      wallClock,
      detail,
    };

    this.recentEvents.push(item);
    if (this.recentEvents.length > MAX_RECENT_EVENTS) {
      this.recentEvents.shift();
    }

    this.notifyListeners();
  }

  // --- Session & Connection Lifecycle ---

  public onSessionInitStart(modelName?: string): void {
    this.sessionId = generateAnonymousSessionId();
    this.sessionStartTime = typeof performance !== "undefined" ? performance.now() : Date.now();
    this.sessionInitStartTime = this.sessionStartTime;
    this.connectionState = "starting";
    this.modelName = modelName || null;
    this.currentTurn = 0;
    this.resetTurnState();
    this.recentEvents = [];

    this.recordDiagnosticEvent("session_init_start", modelName ? `model: ${modelName}` : undefined);

    captureVoiceEvent("voice_session_started", {
      telemetry_session_id: this.sessionId,
      model_name: this.modelName,
    });
  }

  public onMicrophoneReady(): void {
    this.micInitTime = typeof performance !== "undefined" ? performance.now() : Date.now();
    this.recordDiagnosticEvent("microphone_ready");
  }

  public onAudioPlayerReady(): void {
    this.playerInitTime = typeof performance !== "undefined" ? performance.now() : Date.now();
    this.recordDiagnosticEvent("audio_player_ready");
  }

  public onGeminiConnected(): void {
    this.geminiConnectedTime = typeof performance !== "undefined" ? performance.now() : Date.now();
    this.recordDiagnosticEvent("gemini_connected");
  }

  public onGeminiSetupComplete(): void {
    this.geminiSetupCompleteTime = typeof performance !== "undefined" ? performance.now() : Date.now();
    this.connectionState = "connected";
    this.connectionSetupMs = calculateElapsedMs(this.sessionInitStartTime, this.geminiSetupCompleteTime);

    this.recordDiagnosticEvent(
      "setup_complete",
      this.connectionSetupMs !== null ? `${this.connectionSetupMs}ms` : undefined
    );

    if (process.env.NODE_ENV !== "production") {
      console.log(`[VeenoeVoiceTelemetry] connection_ready in ${this.connectionSetupMs}ms`);
    }

    captureVoiceEvent("voice_connection_ready", {
      telemetry_session_id: this.sessionId,
      connection_setup_ms: this.connectionSetupMs,
      model_name: this.modelName,
    });
  }

  public onGeminiDisconnected(): void {
    this.connectionState = "disconnected";
    this.disconnectCount++;
    this.recordDiagnosticEvent("gemini_disconnected");
  }

  public onGeminiError(error: Error | string): void {
    this.connectionState = "error";
    this.connectionErrorCount++;
    const errMsg = typeof error === "string" ? error : error.message;
    this.recordDiagnosticEvent("connection_error", errMsg);

    captureVoiceEvent("voice_connection_error", {
      telemetry_session_id: this.sessionId,
      connection_error_count: this.connectionErrorCount,
      error_message: errMsg,
      model_name: this.modelName,
    });
  }

  public onReconnectAttempt(attemptNumber: number): void {
    this.reconnectAttemptCount++;
    this.recordDiagnosticEvent("reconnect_attempt", `attempt #${attemptNumber}`);
  }

  public onSessionEnded(): void {
    // If a turn was in progress, complete it cleanly
    if (this.turnInputPacketCount > 0 || this.turnOutputChunkCount > 0) {
      this.onTurnComplete();
    }

    this.connectionState = "idle";
    this.recordDiagnosticEvent("session_ended");

    captureVoiceEvent("voice_session_ended", {
      telemetry_session_id: this.sessionId,
      input_packet_count: this.totalInputPackets,
      input_bytes: this.totalInputBytes,
      output_audio_chunk_count: this.totalOutputChunks,
      disconnect_count: this.disconnectCount,
      connection_error_count: this.connectionErrorCount,
      reconnect_attempt_count: this.reconnectAttemptCount,
      model_name: this.modelName,
    });
  }

  // --- Microphone Transport Measurements (Aggregated locally) ---

  public onMicrophonePacketSent(byteLength: number): void {
    const now = typeof performance !== "undefined" ? performance.now() : Date.now();

    // Start a new turn if none is active or previous completed
    if (this.currentTurn === 0) {
      this.currentTurn = 1;
    }

    this.totalInputPackets++;
    this.totalInputBytes += byteLength;

    this.turnInputPacketCount++;
    this.turnInputBytes += byteLength;

    if (this.turnFirstPacketTime === null) {
      this.turnFirstPacketTime = now;
      this.recordDiagnosticEvent("first_input_packet", `${byteLength} bytes`);
    } else if (this.turnLastPacketTime !== null) {
      const interval = now - this.turnLastPacketTime;
      this.turnPacketIntervalSum += interval;
      this.turnPacketIntervalCount++;
    }

    this.turnLastPacketTime = now;
    // Note: We deliberately do NOT call recordDiagnosticEvent or notifyListeners on every packet
    // to avoid UI re-rendering at 100+ times per second.
  }

  // --- Gemini Response Measurements ---

  public onGeminiAudioChunkReceived(): void {
    const now = typeof performance !== "undefined" ? performance.now() : Date.now();

    this.totalOutputChunks++;
    this.turnOutputChunkCount++;

    if (this.turnFirstGeminiAudioTime === null) {
      this.turnFirstGeminiAudioTime = now;

      const proxyLatency = calculateElapsedMs(this.turnLastPacketTime, now);
      this.recordDiagnosticEvent(
        "first_gemini_audio",
        proxyLatency !== null ? `proxy delay: ${proxyLatency}ms` : undefined
      );
    }
  }

  // --- Playback Pipeline Measurements ---

  public onAudioScheduled(queueDurationMs?: number): void {
    const now = typeof performance !== "undefined" ? performance.now() : Date.now();
    if (this.turnFirstPlaybackScheduledTime === null) {
      this.turnFirstPlaybackScheduledTime = now;
    }
    if (queueDurationMs !== undefined) {
      if (this.turnMaxPlaybackQueueMs === null || queueDurationMs > this.turnMaxPlaybackQueueMs) {
        this.turnMaxPlaybackQueueMs = queueDurationMs;
      }
    }
  }

  public onPlaybackStarted(): void {
    const now = typeof performance !== "undefined" ? performance.now() : Date.now();
    if (this.turnFirstPlaybackStartTime === null) {
      this.turnFirstPlaybackStartTime = now;

      const geminiToPlay = calculateElapsedMs(this.turnFirstGeminiAudioTime, now);
      this.recordDiagnosticEvent(
        "playback_started",
        geminiToPlay !== null ? `gemini->playback: ${geminiToPlay}ms` : undefined
      );
    }
  }

  public onPlaybackEnded(): void {
    this.recordDiagnosticEvent("playback_ended");
  }

  public onPlaybackUnderrun(): void {
    this.turnPlaybackUnderruns++;
    this.recordDiagnosticEvent("playback_underrun");
  }

  // --- Interruption Measurements ---

  public onInterruptionSignalReceived(): void {
    this.turnInterruptedTime = typeof performance !== "undefined" ? performance.now() : Date.now();
    this.turnIsInterrupted = true;
    this.recordDiagnosticEvent("interruption_received");
  }

  public onPlaybackStoppedDueToInterruption(): void {
    this.turnPlaybackStoppedTime = typeof performance !== "undefined" ? performance.now() : Date.now();
    const interruptionDuration = calculateElapsedMs(
      this.turnInterruptedTime,
      this.turnPlaybackStoppedTime
    );

    this.recordDiagnosticEvent(
      "playback_stopped_interruption",
      interruptionDuration !== null ? `${interruptionDuration}ms` : undefined
    );

    captureVoiceEvent("voice_interruption", {
      telemetry_session_id: this.sessionId,
      turn_number: this.currentTurn,
      interruption_to_playback_stop_ms: interruptionDuration,
      model_name: this.modelName,
    });

    // Finalize the interrupted turn
    this.finalizeTurn(true);
  }

  // --- Turn Lifecycle Management ---

  public onTurnComplete(): void {
    this.finalizeTurn(false);
  }

  private finalizeTurn(isInterrupted: boolean): void {
    if (this.turnInputPacketCount === 0 && this.turnOutputChunkCount === 0) {
      // Nothing happened in this turn, don't emit empty metrics
      return;
    }

    const inputDurationMs = calculateElapsedMs(this.turnFirstPacketTime, this.turnLastPacketTime);
    const avgPacketBytes = calculateAverage(this.turnInputBytes, this.turnInputPacketCount);
    const avgInterval = calculateAverage(this.turnPacketIntervalSum, this.turnPacketIntervalCount);
    const pps = calculatePacketsPerSecond(this.turnInputPacketCount, inputDurationMs);
    const estDuration = avgPacketBytes ? calculatePcmDurationMs(avgPacketBytes) : null;

    // Latency derivations
    // NOTE: Genuine speech end is unavailable without client-side VAD; reported as null
    const speechEndToFirstGeminiAudioMs: number | null = null;
    const speechEndToFirstPlaybackMs: number | null = null;

    // Honest proxy metric: timestamp of last input packet sent to first audio chunk from Gemini
    const lastInputPacketToFirstGeminiAudioMs = calculateElapsedMs(
      this.turnLastPacketTime,
      this.turnFirstGeminiAudioTime
    );

    const firstGeminiAudioToPlaybackMs = calculateElapsedMs(
      this.turnFirstGeminiAudioTime,
      this.turnFirstPlaybackStartTime
    );

    const interruptionToPlaybackStopMs = calculateElapsedMs(
      this.turnInterruptedTime,
      this.turnPlaybackStoppedTime
    );

    const metricsSnapshot: TurnMetricsSnapshot = {
      turnNumber: this.currentTurn,
      speechEndToFirstGeminiAudioMs,
      lastInputPacketToFirstGeminiAudioMs,
      firstGeminiAudioToPlaybackMs,
      speechEndToFirstPlaybackMs,
      interruptionToPlaybackStopMs,
      inputPacketCount: this.turnInputPacketCount,
      inputBytes: this.turnInputBytes,
      averagePacketBytes: avgPacketBytes,
      averagePacketIntervalMs: avgInterval,
      packetsPerSecond: pps,
      estimatedPacketDurationMs: estDuration,
      outputAudioChunkCount: this.turnOutputChunkCount,
      maxPlaybackQueueMs: this.turnMaxPlaybackQueueMs,
      playbackUnderrunCount: this.turnPlaybackUnderruns,
      interrupted: isInterrupted,
    };

    this.lastCompletedTurnMetrics = metricsSnapshot;

    this.recordDiagnosticEvent(
      isInterrupted ? "turn_interrupted" : "turn_completed",
      `Turn #${this.currentTurn} (Chunks: ${this.turnOutputChunkCount})`
    );

    // Development Console Log
    if (process.env.NODE_ENV !== "production") {
      console.log(`[VeenoeVoiceTelemetry] turn_${isInterrupted ? "interrupted" : "completed"}`, {
        turn: this.currentTurn,
        lastInputToGeminiMs: lastInputPacketToFirstGeminiAudioMs,
        geminiToPlaybackMs: firstGeminiAudioToPlaybackMs,
        interruptionStopMs: interruptionToPlaybackStopMs,
        inputPackets: this.turnInputPacketCount,
        outputChunks: this.turnOutputChunkCount,
      });
    }

    // Emit aggregated turn event to PostHog
    const eventProps: VoiceEventProperties = {
      telemetry_session_id: this.sessionId,
      turn_number: this.currentTurn,
      model_name: this.modelName,

      connection_setup_ms: this.connectionSetupMs,

      speech_end_to_first_gemini_audio_ms: speechEndToFirstGeminiAudioMs,
      last_input_packet_to_first_gemini_audio_ms: lastInputPacketToFirstGeminiAudioMs,
      first_gemini_audio_to_playback_ms: firstGeminiAudioToPlaybackMs,
      speech_end_to_first_playback_ms: speechEndToFirstPlaybackMs,

      interruption_to_playback_stop_ms: interruptionToPlaybackStopMs,

      input_packet_count: this.turnInputPacketCount,
      input_bytes: this.turnInputBytes,
      average_packet_bytes: avgPacketBytes,
      average_packet_interval_ms: avgInterval,
      packets_per_second: pps,
      estimated_packet_duration_ms: estDuration,

      output_audio_chunk_count: this.turnOutputChunkCount,
      max_playback_queue_ms: this.turnMaxPlaybackQueueMs,
      playback_underrun_count: this.turnPlaybackUnderruns,

      disconnect_count: this.disconnectCount,
      reconnect_attempt_count: this.reconnectAttemptCount,
      interrupted: isInterrupted,
    };

    captureVoiceEvent("voice_turn_completed", eventProps);

    // Prepare for next turn
    this.currentTurn++;
    this.resetTurnState();
  }

  private resetTurnState(): void {
    this.turnInputPacketCount = 0;
    this.turnInputBytes = 0;
    this.turnFirstPacketTime = null;
    this.turnLastPacketTime = null;
    this.turnPacketIntervalSum = 0;
    this.turnPacketIntervalCount = 0;
    this.turnFirstGeminiAudioTime = null;
    this.turnFirstPlaybackScheduledTime = null;
    this.turnFirstPlaybackStartTime = null;
    this.turnOutputChunkCount = 0;
    this.turnInterruptedTime = null;
    this.turnPlaybackStoppedTime = null;
    this.turnPlaybackUnderruns = 0;
    this.turnMaxPlaybackQueueMs = null;
    this.turnIsInterrupted = false;
  }

  // --- Diagnostics Snapshot Getter ---

  public getSnapshot(): DiagnosticsSnapshot {
    return {
      telemetrySessionId: this.sessionId,
      connectionState: this.connectionState,
      connectionSetupMs: this.connectionSetupMs,
      currentTurn: this.currentTurn,
      modelName: this.modelName,
      lastTurnMetrics: this.lastCompletedTurnMetrics,
      totalInputPackets: this.totalInputPackets,
      totalInputBytes: this.totalInputBytes,
      totalOutputChunks: this.totalOutputChunks,
      disconnectCount: this.disconnectCount,
      connectionErrorCount: this.connectionErrorCount,
      reconnectAttemptCount: this.reconnectAttemptCount,
      recentEvents: [...this.recentEvents],
    };
  }
}

// Global singleton instance for the application session
export const voiceTelemetry = new VoiceTelemetry();
