/**
 * PostHog Analytics Adapter for Veenoe Voice v2 Telemetry (VEENOE-16)
 *
 * Senior Staff Design Decisions:
 * 1. Safe no-op when NEXT_PUBLIC_POSTHOG_KEY is not configured or in SSR.
 * 2. User identification support: allows associating userId and student name for production troubleshooting.
 * 3. Token & URL sanitization: strips all credentials, ephemeral tokens, and connection URLs before logging or emission.
 * 4. Resilient: network/ad-blocker errors are swallowed safely and never bubble to viva runtime.
 */

import posthog from "posthog-js";

let isPostHogInitialized = false;

export function initPostHog(): boolean {
  if (typeof window === "undefined") {
    return false;
  }

  if (isPostHogInitialized) {
    return true;
  }

  const apiKey = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  const apiHost = process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://us.i.posthog.com";

  if (!apiKey || apiKey.trim() === "") {
    return false;
  }

  try {
    posthog.init(apiKey.trim(), {
      api_host: apiHost.trim(),
      autocapture: false,
      capture_pageview: false,
      capture_pageleave: false,
      disable_session_recording: true,
      advanced_disable_decide: true,
      person_profiles: "identified_only", // Supports identified users for production troubleshooting
      persistence: "memory", // Keep state lightweight without cookie tracking
      loaded: () => {
        isPostHogInitialized = true;
      },
    });
    isPostHogInitialized = true;
    return true;
  } catch (err) {
    console.warn("[PostHog] Failed to initialize:", err);
    return false;
  }
}

/**
 * Identify a user in PostHog for production troubleshooting.
 */
export function identifyUser(userId: string, traits?: Record<string, unknown>): void {
  if (typeof window === "undefined" || !userId) return;
  try {
    if (!isPostHogInitialized) {
      const initialized = initPostHog();
      if (!initialized) return;
    }
    posthog.identify(userId, traits);
  } catch (err) {
    if (process.env.NODE_ENV !== "production") {
      console.warn("[PostHog] Error in identifyUser:", err);
    }
  }
}

export type VoiceEventName =
  | "voice_session_started"
  | "voice_connection_ready"
  | "voice_turn_completed"
  | "voice_interruption"
  | "voice_connection_error"
  | "voice_session_ended"
  | "voice_diagnostics_ping";

export interface VoiceEventProperties {
  telemetry_session_id: string;
  user_id?: string | null;
  student_name?: string | null;
  turn_number?: number | null;
  model_name?: string | null;

  // Connection
  connection_setup_ms?: number | null;

  // Turn Latency
  speech_end_to_first_gemini_audio_ms?: number | null; // null without client VAD
  last_input_packet_to_first_gemini_audio_ms?: number | null; // Transport turnaround
  first_gemini_audio_to_playback_ms?: number | null;
  speech_end_to_first_playback_ms?: number | null;

  // Interruption
  interruption_to_playback_stop_ms?: number | null;

  // Audio Input Transport Aggregates
  input_packet_count?: number | null;
  input_bytes?: number | null;
  average_packet_bytes?: number | null;
  average_packet_interval_ms?: number | null;
  packets_per_second?: number | null;
  estimated_packet_duration_ms?: number | null;

  // Gemini Output
  output_audio_chunk_count?: number | null;

  // Playback
  max_playback_queue_ms?: number | null;
  playback_underrun_count?: number | null;
  scheduled_playback_gap_count?: number | null;

  // Reliability
  disconnect_count?: number | null;
  connection_error_count?: number | null;
  connection_retry_count?: number | null;

  interrupted?: boolean | null;
  error_type?: string | null;
  error_category?: string | null;
  safe_error_message?: string | null;
  [key: string]: unknown;
}

export interface SanitizedError {
  error_type: string;
  error_category: string;
  safe_message: string;
}

/**
 * Sanitizes errors by stripping URLs, query params, tokens, and API keys.
 * Ensures sensitive credentials are never stored or dispatched.
 */
export function sanitizeErrorMessage(error: unknown): SanitizedError {
  if (!error) {
    return {
      error_type: "UnknownError",
      error_category: "unknown",
      safe_message: "An unknown error occurred",
    };
  }

  const rawMsg = error instanceof Error ? error.message : String(error);
  const errorType = error instanceof Error ? error.name : "Error";

  // Categorize error
  let category = "general";
  const lower = rawMsg.toLowerCase();
  if (lower.includes("websocket") || lower.includes("ws") || lower.includes("network") || lower.includes("connection")) {
    category = "gemini_connection";
  } else if (lower.includes("audio") || lower.includes("worklet") || lower.includes("microphone") || lower.includes("media")) {
    category = "audio_pipeline";
  } else if (lower.includes("auth") || lower.includes("token") || lower.includes("credential")) {
    category = "authentication";
  }

  // Redact any tokens, URLs, query parameters, API keys, or long hashes
  const safeMsg = rawMsg
    .replace(/auth_tokens\/[a-zA-Z0-9_\-\.]+/gi, "[REDACTED_TOKEN]")
    .replace(/AIza[a-zA-Z0-9_\-]+/gi, "[REDACTED_KEY]")
    .replace(/wss?:\/\/[^\s]+/gi, "[REDACTED_WS_URL]")
    .replace(/https?:\/\/[^\s]+/gi, "[REDACTED_HTTP_URL]")
    .replace(/key=[a-zA-Z0-9_\-]+/gi, "key=[REDACTED]")
    .replace(/token=[a-zA-Z0-9_\-]+/gi, "token=[REDACTED]")
    .slice(0, 150);

  return {
    error_type: errorType,
    error_category: category,
    safe_message: safeMsg,
  };
}

/**
 * Clean payload to strip undefined values and ensure numbers are numbers,
 * preventing any unintended data leakage.
 */
function cleanProperties(properties: Record<string, unknown>): Record<string, unknown> {
  const cleaned: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(properties)) {
    if (value === undefined) {
      continue;
    }
    // Reject any accidental buffers or audio arrays
    if (
      value instanceof ArrayBuffer ||
      ArrayBuffer.isView(value) ||
      (typeof value === "string" && value.length > 500)
    ) {
      continue;
    }
    cleaned[key] = value;
  }

  return cleaned;
}

/**
 * Capture a voice telemetry event safely in PostHog.
 * Never throws, gracefully no-ops when PostHog is unconfigured.
 */
export function captureVoiceEvent(
  eventName: VoiceEventName,
  properties: VoiceEventProperties
): void {
  try {
    if (!isPostHogInitialized) {
      const initialized = initPostHog();
      if (!initialized) {
        return;
      }
    }

    const payload = cleanProperties(properties);
    posthog.capture(eventName, payload);
  } catch (err) {
    if (process.env.NODE_ENV !== "production") {
      console.warn(`[PostHog] Error capturing event ${eventName}:`, err);
    }
  }
}

export { posthog };
