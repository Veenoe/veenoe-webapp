# Voice Telemetry, PostHog Analytics & Developer Diagnostics (VEENOE-16)

## Purpose

VEENOE-16 establishes an objective, empirical baseline for Veenoe's real-time voice pipeline before making architectural changes in subsequent Voice v2 tasks (model migration, full-duplex/barge-in, VAD tuning, audio resampling, echo cancellation, playback redesign).

Key questions this telemetry answers:
- How fast does Gemini return the first audio chunk?
- What is the client playback pipeline delay?
- How quickly does audio playback cease upon an interruption?
- How many microphone packets are sent and at what frequency?
- Did connections experience disconnects, errors, or retries?

---

## Environment Variables

Configure these in `.env.local` (see `.env.example`):

```env
# PostHog Project Configuration (Client-side)
NEXT_PUBLIC_POSTHOG_KEY=phc_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
NEXT_PUBLIC_POSTHOG_HOST=https://us.i.posthog.com

# Developer Diagnostics HUD (true in dev/staging, false in prod)
NEXT_PUBLIC_VOICE_DIAGNOSTICS=true
```

> **Resilience Guarantee:** If `NEXT_PUBLIC_POSTHOG_KEY` is omitted or network calls are blocked by an ad-blocker, analytics silently no-ops. Viva sessions are never interrupted or blocked.

---

## PostHog Setup

Voice telemetry is anonymous technical performance telemetry.
PostHog does not receive student names, emails, Clerk IDs, transcripts, raw audio, or credentials.

PostHog is integrated via `posthog-js` with strict privacy constraints:
- **Autocapture:** Disabled (`autocapture: false`)
- **Session Replay:** Disabled (`disable_session_recording: true`)
- **Pageviews:** Disabled (`capture_pageview: false`)
- **PII / Identities:** Person profiles set to `"never"`. No student names, emails, Clerk user IDs, or transcripts are sent.
- **Payload Sanitization:** Raw PCM audio buffers, base64 data, error messages, and API tokens are strictly filtered out before dispatch.

### Event Names & Vocabulary

| Event Name | Trigger | Key Properties |
|---|---|---|
| `voice_session_started` | Viva session initialized | `telemetry_session_id`, `model_name` |
| `voice_connection_ready` | Gemini `setup_complete` received | `telemetry_session_id`, `connection_setup_ms`, `model_name` |
| `voice_turn_completed` | Model turn completed or finished | `turn_number`, `last_input_packet_to_first_gemini_audio_ms`, `first_gemini_audio_to_playback_ms`, `input_packet_count`, `input_bytes`, `packets_per_second`, `output_audio_chunk_count`, `max_playback_queue_ms`, `playback_underrun_count`, `interrupted` |
| `voice_interruption` | Gemini interruption detected & playback stopped | `turn_number`, `interruption_to_playback_stop_ms` |
| `voice_connection_error` | WebSocket / setup error | `telemetry_session_id`, `error_type`, `error_category`, `connection_error_count`, `model_name` |
| `voice_session_ended` | Session teardown / concluded | `total_input_packets`, `total_input_bytes`, `total_output_chunks`, `disconnect_count`, `connection_error_count` |

> **Note on VAD Timestamps:** The current Gemini Live protocol does not deliver client-side VAD speech endpoint markers. As a result, `speech_end_to_first_gemini_audio_ms` is marked unavailable (`null`), and the honest proxy metric `last_input_packet_to_first_gemini_audio_ms` is recorded.

---

## Developer Voice Diagnostics Panel

The developer HUD provides live pipeline metrics and a bounded event timeline:
- **Enabling:** Automatically active when `NODE_ENV !== "production"` or when `NEXT_PUBLIC_VOICE_DIAGNOSTICS=true`.
- **Location:** Floating badge in the bottom-right corner of `/viva`. Click to expand.
- **Features:**
  - Real-time connection state & setup duration.
  - Proxy turn latency (`last_input_packet -> first_gemini_audio`) and playback delay.
  - Interruption stop latency (`interruption -> playback_stop`).
  - Microphone transport stats (packets/sec, avg packet size).
  - Bounded recent event timeline (last 20 lifecycle events with `+XXXms` session offset).
  - **Copy JSON** button: Copies full anonymous telemetry state to clipboard for debugging.

---

## How to Run Baseline Scenarios

To record baseline measurements before Voice v2 improvements:

### Scenario 1: Quiet-Room Conversation
1. Ensure a quiet background (< 40 dB ambient noise).
2. Start a viva session from `/viva`.
3. Speak a concise answer (~10 seconds) and pause naturally.
4. Allow the AI examiner to respond completely.
5. In the Diagnostics panel or PostHog, observe `last_input_packet_to_first_gemini_audio_ms` and `first_gemini_audio_to_playback_ms`.

### Scenario 2: User Interruption (Barge-In)
1. While the AI examiner is speaking, speak clearly into the microphone.
2. Note when Gemini triggers interruption and local audio stops.
3. Observe `interruption_to_playback_stop_ms` in the Diagnostics panel.

### Scenario 3: Noisy Environment
1. Introduce background noise (e.g. ambient cafe sound or typing).
2. Carry out 2-3 conversation turns.
3. Observe whether noise triggers accidental turn closures or affects `last_input_packet_to_first_gemini_audio_ms`.

---

## Viewing Analytics in PostHog

1. Open your PostHog Dashboard -> **Activity** -> **Live Events**.
2. Filter by Event: `voice_turn_completed` or `voice_interruption`.
3. Create Insights:
   - **Median Response Latency:** Trend of `p50(last_input_packet_to_first_gemini_audio_ms)`
   - **Playback Pipeline Delay:** Trend of `p50(first_gemini_audio_to_playback_ms)`
   - **Interruption Cease Time:** Trend of `p50(interruption_to_playback_stop_ms)`
