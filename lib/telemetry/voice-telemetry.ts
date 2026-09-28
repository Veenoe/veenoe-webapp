/**
 * Voice Telemetry Abstraction for Veenoe Voice v2 (VEENOE-16)
 *
 * Senior Staff Product Architecture:
 * 1. Monotonic performance.now() elapsed timings with zero React re-render overhead.
 * 2. Independent session baselines: complete session state reset on every initialization.
 * 3. Idempotent session teardown: ensures exactly-once voice_session_ended events.
 * 4. Intentional vs unexpected disconnect separation: normal shutdowns do not inflate failure metrics.
 * 5. Sanitized error reporting: prevents credentials/tokens/URLs from ever leaking to PostHog or snapshots.
 * 6. User identity attribution: supports linking user ID and student name for production analysis.
 * 7. Transparent metric labeling: distinguishes raw transport turnaround from genuine speech VAD.
 */

import {
  captureVoiceEvent,
  sanitizeErrorMessage,
  VoiceEventProperties,
} from "../analytics/posthog";
import type { MicrophoneDiagnostics, MicrophoneFormat, MicrophoneLevel, MicrophoneErrorCode } from "../gemini/audio-recorder";
import type { PlaybackBufferEvent, PlaybackBufferStats } from "../gemini/audio-player";

export interface PlaybackTraceEvent extends PlaybackBufferEvent {
  relTimeMs: number;
}

export interface PlaybackBufferSnapshot {
  queueDepthMs: number | null;
  pendingEncodedBytes: number;
  inFlightBytes: number;
  stats: PlaybackBufferStats | null;
  recentEvents: PlaybackTraceEvent[];
}

export interface DiagnosticEventItem {
  id: string;
  name: string;
  relTimeMs: number;
  wallClock: string;
  detail?: string;
}

export interface TurnMetricsSnapshot {
  turnNumber: number;
  speechEndToFirstGeminiAudioMs: number | null; // Currently unavailable without client speech-end detection
  lastInputPacketToFirstGeminiAudioMs: number | null; // Raw transport turnaround (last packet -> first audio)
  firstGeminiAudioToPlaybackMs: number | null; // Audio received to playback start delay
  speechEndToFirstPlaybackMs: number | null; // Currently unavailable
  clearRequestToAcknowledgmentMs: number | null; // Main-thread clear request to worklet acknowledgment
  inputPacketCount: number;
  inputBytes: number;
  averagePacketBytes: number | null;
  averagePacketIntervalMs: number | null;
  packetsPerSecond: number | null;
  estimatedPacketDurationMs: number | null;
  outputAudioChunkCount: number;
  maxPlaybackQueueMs: number | null;
  playbackUnderrunCount: number;
  scheduledPlaybackGapCount: number;
  interrupted: boolean;
}

export interface DiagnosticsSnapshot {
  telemetrySessionId: string;
  connectionState: "idle" | "starting" | "connected" | "disconnected" | "error";
  connectionSetupMs: number | null;
  currentTurn: number;
  modelName: string | null;
  vadProfile: string | null;
  microphoneFormat: MicrophoneFormat | null;
  microphoneDiagnostics: MicrophoneDiagnostics | null;
  microphoneLevel: MicrophoneLevel | null;
  microphoneErrorCode: MicrophoneErrorCode | null;
  inputPacketsDropped: number;
  sessionPlaybackUnderrunCount: number;
  playbackBuffer: PlaybackBufferSnapshot;
  lastTurnMetrics: TurnMetricsSnapshot | null;
  // Session totals
  totalInputPackets: number;
  totalInputBytes: number;
  totalOutputChunks: number;
  disconnectCount: number;
  connectionErrorCount: number;
  connectionRetryCount: number;
  reconnectAttemptCount: number; // Deprecated alias for connectionRetryCount
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
const MAX_PLAYBACK_TRACE_EVENTS = 80;

export class VoiceTelemetry {
  private sessionId: string;
  private sessionStartTime: number;
  private connectionState: "idle" | "starting" | "connected" | "disconnected" | "error" = "idle";
  private modelName: string | null = null;
  private vadProfile: string | null = null;
  private microphoneFormat: MicrophoneFormat | null = null;
  private microphoneDiagnostics: MicrophoneDiagnostics | null = null;
  private microphoneLevel: MicrophoneLevel | null = null;
  private microphoneErrorCode: MicrophoneErrorCode | null = null;
  private inputPacketsDropped = 0;
  private sessionPlaybackUnderruns = 0;
  private pendingClear: { generation: number; turn: number; sessionId: string } | null = null;
  private playbackQueueDepthMs: number | null = null;
  private playbackPendingEncodedBytes = 0;
  private playbackInFlightBytes = 0;
  private playbackStats: PlaybackBufferStats | null = null;
  private playbackTrace: PlaybackTraceEvent[] = [];

  // Session lifecycle flags
  private isSessionActive = false;
  private isIntentionalDisconnect = false;

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
  private connectionRetryCount = 0;

  // Turn-level state
  private currentTurn = 0;
  private turnInputPacketCount = 0;
  private turnInputBytes = 0;
  private turnFirstPacketTime: number | null = null;
  private turnLastPacketTime: number | null = null;
  private turnPacketIntervalSum = 0;
  private turnPacketIntervalCount = 0;
  private turnFirstGeminiAudioTime: number | null = null;
  private turnInputToFirstAudioMs: number | null = null;
  private turnFirstPlaybackScheduledTime: number | null = null;
  private turnFirstPlaybackStartTime: number | null = null;
  private turnOutputChunkCount = 0;
  private turnClearAcknowledgmentMs: number | null = null;
  private turnPlaybackUnderruns = 0;
  private turnMaxPlaybackQueueMs: number | null = null;

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

  /**
   * Starts a new viva session telemetry lifecycle.
   * Completely resets all session-scoped counters to guarantee an independent baseline.
   */
  public onSessionInitStart(modelName?: string, vadProfile?: string): void {
    this.sessionId = generateAnonymousSessionId();
    this.sessionStartTime = typeof performance !== "undefined" ? performance.now() : Date.now();
    this.sessionInitStartTime = this.sessionStartTime;
    this.connectionState = "starting";
    this.modelName = modelName || null;
    this.vadProfile = vadProfile || null;
    this.isSessionActive = true;
    this.isIntentionalDisconnect = false;

    // Reset ALL session counters (prevents cross-session contamination)
    this.totalInputPackets = 0;
    this.inputPacketsDropped = 0;
    this.sessionPlaybackUnderruns = 0;
    this.pendingClear = null;
    this.playbackQueueDepthMs = null;
    this.playbackPendingEncodedBytes = 0;
    this.playbackInFlightBytes = 0;
    this.playbackStats = null;
    this.playbackTrace = [];
    this.microphoneFormat = null;
    this.microphoneDiagnostics = null;
    this.microphoneLevel = null;
    this.microphoneErrorCode = null;
    this.totalInputBytes = 0;
    this.totalOutputChunks = 0;
    this.disconnectCount = 0;
    this.connectionErrorCount = 0;
    this.connectionRetryCount = 0;

    this.micInitTime = null;
    this.playerInitTime = null;
    this.geminiConnectedTime = null;
    this.geminiSetupCompleteTime = null;
    this.connectionSetupMs = null;
    this.lastCompletedTurnMetrics = null;

    this.currentTurn = 0;
    this.resetTurnState();
    this.recentEvents = [];

    this.recordDiagnosticEvent("session_init_start", modelName ? `model: ${modelName}` : undefined);

    captureVoiceEvent("voice_session_started", {
      telemetry_session_id: this.sessionId,
      model_name: this.modelName,
      vad_profile: this.vadProfile,
    });
  }

  public onMicrophoneReady(): void {
    this.micInitTime = typeof performance !== "undefined" ? performance.now() : Date.now();
    this.recordDiagnosticEvent("microphone_ready");
  }

  public onMicrophoneFormat(format: MicrophoneFormat): void {
    this.microphoneFormat = { ...format };
  }

  public onMicrophoneDiagnostics(diagnostics: MicrophoneDiagnostics): void {
    this.microphoneDiagnostics = diagnostics;
    this.recordDiagnosticEvent("microphone_settings");
  }

  public onMicrophoneLevel(level: MicrophoneLevel): void {
    this.microphoneLevel = level; // Local only; the panel polls while open.
  }

  public onMicrophoneError(code: MicrophoneErrorCode): void {
    this.microphoneErrorCode = code;
    this.recordDiagnosticEvent("microphone_error", code);
  }

  public onMicrophonePacketsDropped(count: number): void {
    this.inputPacketsDropped += count;
  }

  /** Local-only playback accounting. The diagnostics panel polls this state. */
  public onPlaybackBufferEvent(event: PlaybackBufferEvent): void {
    if (event.type === 'clear_requested' && event.reason === 'interruption') {
      this.pendingClear = { generation: event.generation, turn: this.currentTurn, sessionId: this.sessionId };
    }
    if (event.type === 'cleared' && event.reason === 'interruption' &&
        this.pendingClear?.generation === event.generation && this.pendingClear.sessionId === this.sessionId) {
      const { turn } = this.pendingClear;
      this.pendingClear = null;
      if (event.clearAcknowledgmentMs !== undefined) {
        if (this.lastCompletedTurnMetrics?.turnNumber === turn)
          this.lastCompletedTurnMetrics.clearRequestToAcknowledgmentMs = event.clearAcknowledgmentMs;
        else if (this.currentTurn === turn) this.turnClearAcknowledgmentMs = event.clearAcknowledgmentMs;
        captureVoiceEvent('voice_playback_clear_acknowledged', {
          telemetry_session_id: this.sessionId, turn_number: turn,
          clear_request_to_acknowledgment_ms: event.clearAcknowledgmentMs,
        });
      }
    }
    if (event.queueDepthMs !== undefined) this.playbackQueueDepthMs = event.queueDepthMs;
    if (event.pendingEncodedBytes !== undefined) this.playbackPendingEncodedBytes = event.pendingEncodedBytes;
    if (event.inFlightBytes !== undefined) this.playbackInFlightBytes = event.inFlightBytes;
    if (event.stats) this.playbackStats = { ...event.stats };
    const now = typeof performance !== "undefined" ? performance.now() : Date.now();
    this.playbackTrace.push({
      type: event.type,
      generation: event.generation,
      ...(event.chunkId !== undefined ? { chunkId: event.chunkId } : {}),
      ...(event.samples !== undefined ? { samples: event.samples } : {}),
      ...(event.queueDepthMs !== undefined ? { queueDepthMs: event.queueDepthMs } : {}),
      ...(event.reason !== undefined ? { reason: event.reason } : {}),
      ...(event.clearAcknowledgmentMs !== undefined ? { clearAcknowledgmentMs: event.clearAcknowledgmentMs } : {}),
      ...(event.pendingEncodedBytes !== undefined ? { pendingEncodedBytes: event.pendingEncodedBytes } : {}),
      ...(event.inFlightBytes !== undefined ? { inFlightBytes: event.inFlightBytes } : {}),
      relTimeMs: Math.round(now - this.sessionStartTime),
    });
    if (this.playbackTrace.length > MAX_PLAYBACK_TRACE_EVENTS) this.playbackTrace.shift();
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

  /**
   * Set flag to indicate whether upcoming disconnect is intentional (normal teardown).
   */
  public setIntentionalDisconnect(intentional: boolean): void {
    this.isIntentionalDisconnect = intentional;
  }

  public onGeminiDisconnected(): void {
    this.connectionState = "disconnected";
    // Only increment disconnect count if unexpected (prevents normal shutdown from inflating drops)
    if (!this.isIntentionalDisconnect) {
      this.disconnectCount++;
    }
    this.recordDiagnosticEvent(
      this.isIntentionalDisconnect ? "gemini_closed" : "gemini_disconnected"
    );
  }

  public onGeminiError(error: unknown): void {
    this.connectionState = "error";
    this.connectionErrorCount++;

    const sanitized = sanitizeErrorMessage(error);
    // Developer-local UI timeline may keep sanitized summary
    this.recordDiagnosticEvent("connection_error", sanitized.safe_message);

    // PostHog receives strictly stable technical categorization (no error messages)
    captureVoiceEvent("voice_connection_error", {
      telemetry_session_id: this.sessionId,
      connection_error_count: this.connectionErrorCount,
      error_type: sanitized.error_type,
      error_category: sanitized.error_category,
      model_name: this.modelName,
    });
  }

  public onConnectionRetry(attemptNumber: number): void {
    this.connectionRetryCount++;
    this.recordDiagnosticEvent("connection_retry", `attempt #${attemptNumber}`);
  }

  // Deprecated alias for backward compatibility
  public onReconnectAttempt(attemptNumber: number): void {
    this.onConnectionRetry(attemptNumber);
  }

  /**
   * Concludes session telemetry. Idempotent to handle multiple cleanup invocation paths.
   */
  public onSessionEnded(): void {
    if (!this.isSessionActive) {
      return; // Already ended - idempotent guard
    }
    this.isSessionActive = false;
    this.pendingClear = null;

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
      input_packets_dropped: this.inputPacketsDropped,
      output_audio_chunk_count: this.totalOutputChunks,
      disconnect_count: this.disconnectCount,
      connection_error_count: this.connectionErrorCount,
      connection_retry_count: this.connectionRetryCount,
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
    // High-frequency packets deliberately do not trigger diagnostic re-renders
  }

  // --- Gemini Response Measurements ---

  public onGeminiAudioChunkReceived(): void {
    const now = typeof performance !== "undefined" ? performance.now() : Date.now();

    this.totalOutputChunks++;
    this.turnOutputChunkCount++;

    if (this.turnFirstGeminiAudioTime === null) {
      this.turnFirstGeminiAudioTime = now;

      const proxyLatency = calculateElapsedMs(this.turnLastPacketTime, now);
      this.turnInputToFirstAudioMs = proxyLatency;
      this.recordDiagnosticEvent(
        "first_gemini_audio",
        proxyLatency !== null ? `turnaround: ${proxyLatency}ms` : undefined
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
    this.sessionPlaybackUnderruns++;
    this.recordDiagnosticEvent("playback_gap");
  }

  // --- Interruption Measurements ---

  public onInterruptionSignalReceived(): void {
    this.recordDiagnosticEvent("interruption_received");
  }

  public onInterruptionClearRequested(): void {
    // The clear request is synchronous; its worklet acknowledgment arrives later.
    this.finalizeInterruption();
  }

  public onInterruptionWithoutPlayback(): void {
    this.finalizeInterruption();
  }

  private finalizeInterruption(): void {
    captureVoiceEvent("voice_interruption", {
      telemetry_session_id: this.sessionId,
      turn_number: this.currentTurn,
      model_name: this.modelName,
      vad_profile: this.vadProfile,
    });

    this.finalizeTurn(true);
  }

  // --- Turn Lifecycle Management ---

  public onTurnComplete(): void {
    this.finalizeTurn(false);
  }

  private finalizeTurn(isInterrupted: boolean): void {
    if (this.turnInputPacketCount === 0 && this.turnOutputChunkCount === 0) {
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

    // Honest transport turnaround: timestamp of last input packet sent to first audio chunk from Gemini
    const lastInputPacketToFirstGeminiAudioMs = this.turnInputToFirstAudioMs;

    const firstGeminiAudioToPlaybackMs = calculateElapsedMs(
      this.turnFirstGeminiAudioTime,
      this.turnFirstPlaybackStartTime
    );

    const clearRequestToAcknowledgmentMs = this.turnClearAcknowledgmentMs;

    const metricsSnapshot: TurnMetricsSnapshot = {
      turnNumber: this.currentTurn,
      speechEndToFirstGeminiAudioMs,
      lastInputPacketToFirstGeminiAudioMs,
      firstGeminiAudioToPlaybackMs,
      speechEndToFirstPlaybackMs,
      clearRequestToAcknowledgmentMs,
      inputPacketCount: this.turnInputPacketCount,
      inputBytes: this.turnInputBytes,
      averagePacketBytes: avgPacketBytes,
      averagePacketIntervalMs: avgInterval,
      packetsPerSecond: pps,
      estimatedPacketDurationMs: estDuration,
      outputAudioChunkCount: this.turnOutputChunkCount,
      maxPlaybackQueueMs: this.turnMaxPlaybackQueueMs,
      playbackUnderrunCount: this.turnPlaybackUnderruns,
      scheduledPlaybackGapCount: this.turnPlaybackUnderruns,
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
        lastPacketToFirstAudioMs: lastInputPacketToFirstGeminiAudioMs,
        geminiToPlaybackMs: firstGeminiAudioToPlaybackMs,
        clearAcknowledgmentMs: clearRequestToAcknowledgmentMs,
        inputPackets: this.turnInputPacketCount,
        outputChunks: this.turnOutputChunkCount,
      });
    }

    // Emit aggregated turn event to PostHog
    const eventProps: VoiceEventProperties = {
      telemetry_session_id: this.sessionId,
      turn_number: this.currentTurn,
      model_name: this.modelName,
      vad_profile: this.vadProfile,

      connection_setup_ms: this.connectionSetupMs,

      speech_end_to_first_gemini_audio_ms: speechEndToFirstGeminiAudioMs,
      last_input_packet_to_first_gemini_audio_ms: lastInputPacketToFirstGeminiAudioMs,
      first_gemini_audio_to_playback_ms: firstGeminiAudioToPlaybackMs,
      speech_end_to_first_playback_ms: speechEndToFirstPlaybackMs,

      clear_request_to_acknowledgment_ms: clearRequestToAcknowledgmentMs,

      input_packet_count: this.turnInputPacketCount,
      input_bytes: this.turnInputBytes,
      average_packet_bytes: avgPacketBytes,
      average_packet_interval_ms: avgInterval,
      packets_per_second: pps,
      estimated_packet_duration_ms: estDuration,

      output_audio_chunk_count: this.turnOutputChunkCount,
      max_playback_queue_ms: this.turnMaxPlaybackQueueMs,
      playback_underrun_count: this.turnPlaybackUnderruns,
      scheduled_playback_gap_count: this.turnPlaybackUnderruns,

      disconnect_count: this.disconnectCount,
      connection_retry_count: this.connectionRetryCount,
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
    this.turnInputToFirstAudioMs = null;
    this.turnFirstPlaybackScheduledTime = null;
    this.turnFirstPlaybackStartTime = null;
    this.turnOutputChunkCount = 0;
    this.turnClearAcknowledgmentMs = null;
    this.turnPlaybackUnderruns = 0;
    this.turnMaxPlaybackQueueMs = null;
  }

  // --- Diagnostics Snapshot Getter ---

  public getSnapshot(): DiagnosticsSnapshot {
    return {
      telemetrySessionId: this.sessionId,
      connectionState: this.connectionState,
      connectionSetupMs: this.connectionSetupMs,
      currentTurn: this.currentTurn,
      modelName: this.modelName,
      vadProfile: this.vadProfile,
      microphoneFormat: this.microphoneFormat && { ...this.microphoneFormat },
      microphoneDiagnostics: this.microphoneDiagnostics && { ...this.microphoneDiagnostics },
      microphoneLevel: this.microphoneLevel && { ...this.microphoneLevel },
      microphoneErrorCode: this.microphoneErrorCode,
      inputPacketsDropped: this.inputPacketsDropped,
      sessionPlaybackUnderrunCount: this.sessionPlaybackUnderruns,
      playbackBuffer: {
        queueDepthMs: this.playbackQueueDepthMs,
        pendingEncodedBytes: this.playbackPendingEncodedBytes,
        inFlightBytes: this.playbackInFlightBytes,
        stats: this.playbackStats && { ...this.playbackStats },
        recentEvents: [...this.playbackTrace],
      },
      lastTurnMetrics: this.lastCompletedTurnMetrics,
      totalInputPackets: this.totalInputPackets,
      totalInputBytes: this.totalInputBytes,
      totalOutputChunks: this.totalOutputChunks,
      disconnectCount: this.disconnectCount,
      connectionErrorCount: this.connectionErrorCount,
      connectionRetryCount: this.connectionRetryCount,
      reconnectAttemptCount: this.connectionRetryCount,
      recentEvents: [...this.recentEvents],
    };
  }

  /**
   * Diagnostic utility to verify live PostHog connectivity from developer UI.
   */
  public sendTestPing(): void {
    captureVoiceEvent("voice_diagnostics_ping", {
      telemetry_session_id: this.sessionId,
      model_name: this.modelName,
      ping_timestamp: new Date().toISOString(),
    });
    this.recordDiagnosticEvent("posthog_ping", "Diagnostics ping dispatched");
  }
}

// Global singleton instance for the application session
export const voiceTelemetry = new VoiceTelemetry();
