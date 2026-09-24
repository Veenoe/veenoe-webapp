/**
 * PostHog Analytics Adapter for Veenoe Voice v2 Telemetry (VEENOE-16)
 *
 * Design Decisions:
 * 1. Safe no-op when NEXT_PUBLIC_POSTHOG_KEY is not configured or in SSR.
 * 2. Privacy-first: all autocapture, session replay, and PII collection are disabled.
 * 3. Anonymous telemetry correlation: uses anonymous UUID only.
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
      person_profiles: "never",
      persistence: "memory", // Keep state lightweight and avoid persistent cookie tracking
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

export type VoiceEventName =
  | "voice_session_started"
  | "voice_connection_ready"
  | "voice_turn_completed"
  | "voice_interruption"
  | "voice_connection_error"
  | "voice_session_ended";

export interface VoiceEventProperties {
  telemetry_session_id: string;
  turn_number?: number | null;
  model_name?: string | null;

  // Connection
  connection_setup_ms?: number | null;

  // Turn Latency
  speech_end_to_first_gemini_audio_ms?: number | null;
  last_input_packet_to_first_gemini_audio_ms?: number | null;
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

  // Reliability
  disconnect_count?: number | null;
  connection_error_count?: number | null;
  reconnect_attempt_count?: number | null;

  interrupted?: boolean | null;
  error_message?: string | null;
  [key: string]: unknown;
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
    // Fail silently in production, minimal warn in dev
    if (process.env.NODE_ENV !== "production") {
      console.warn(`[PostHog] Error capturing event ${eventName}:`, err);
    }
  }
}

export { posthog };
