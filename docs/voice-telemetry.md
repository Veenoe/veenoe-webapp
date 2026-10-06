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

| Event Name                          | Trigger                                                       | Key Properties                                                                                                                                                                                                                                             |
| ----------------------------------- | ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `voice_session_started`             | Viva session initialized                                      | `telemetry_session_id`, `model_name`                                                                                                                                                                                                                       |
| `voice_connection_ready`            | Gemini `setup_complete` received                              | `telemetry_session_id`, `connection_setup_ms`, `model_name`                                                                                                                                                                                                |
| `voice_turn_completed`              | Model turn completed or finished                              | `turn_number`, `last_input_packet_to_first_gemini_audio_ms`, `first_gemini_audio_to_playback_ms`, `input_packet_count`, `input_bytes`, `packets_per_second`, `output_audio_chunk_count`, `max_playback_queue_ms`, `playback_underrun_count`, `interrupted` |
| `voice_interruption`                | Gemini interruption detected; clear requested without waiting | `turn_number`                                                                                                                                                                                                                                              |
| `voice_playback_clear_acknowledged` | Matching worklet clear acknowledged                           | `turn_number`, `clear_request_to_acknowledgment_ms`                                                                                                                                                                                                        |
| `voice_connection_error`            | WebSocket / setup error                                       | `telemetry_session_id`, `error_type`, `error_category`, `connection_error_count`, `model_name`                                                                                                                                                             |
| `voice_session_ended`               | Session teardown / concluded                                  | `total_input_packets`, `total_input_bytes`, `total_output_chunks`, `disconnect_count`, `connection_error_count`                                                                                                                                            |

> **Note on speech timing:** Microphone packets continue through silence, so `last_input_packet_to_first_gemini_audio_ms` is a transport interval, not response latency after the student finishes speaking. The physical speech-end metrics remain unavailable (`null`). When Gemini supplies `voiceActivity`, local diagnostics separately record `serverSpeechEndToFirstGeminiAudioMs` and `serverSpeechEndToFirstPlaybackMs`, measured from receipt of `ACTIVITY_END`. These exclude the input uplink and server VAD detection delay; they do not estimate mouth-to-ear latency. If no boundary arrives, the metrics remain `null`.

### Investigating delayed replies

The local event timeline records `server_speech_start`, `server_speech_end`, and
`server_waiting_for_input` without audio, transcript text, or credentials. Speech
end changes the idle conversation indicator to Thinking; waiting for more input
returns it to Listening. Active playback keeps the Speaking indicator until it
drains. These signals do not gate microphone forwarding or trigger extra model
requests.

For a delayed reply, copy diagnostics immediately after that turn and note when
you finished speaking. Check whether Gemini emitted speech end, whether it asked
for more input, and how long it took to deliver audio after that boundary. A missing
speech-end event cannot establish whether Gemini failed to detect silence or
simply did not emit the optional signal.

The October 6 sample had no reconnects or transport errors, 11 dropped packets
out of 13,539, one playback underrun, and 424,528 cleared output samples (17.7
seconds at 24 kHz). Its last-packet intervals cannot explain the reported waits.
Compared with September 30 (`fa6bc80` web, `d7b1655` backend), microphone capture,
PCM buffering, model selection, and the `balanced-v1` VAD policy were unchanged;
the assessment prompt and startup/recovery ownership changed. Repeated questions
after acknowledgments are addressed in the prompt, but a specific latency-causing
commit has not been established from this sample.

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

### VEENOE-20 microphone transport

The browser-selected `AudioContext.sampleRate` is the worklet input rate. Track
`getSettings().sampleRate` is shown only when available. A stateful windowed-sinc
low-pass resampler converts that stream to 16 kHz mono; a 16 kHz graph uses a
pass-through path. The worklet emits 320-sample, 640-byte, 20 ms little-endian
PCM16 packets. It retains packet remainders across render calls and discards
them when the recorder node is stopped. The source graph is connected to the
destination through zero gain so browsers continue rendering it without mic
feedback.

At most three packets may await main-thread acknowledgement, plus one latest
unsent packet. When that handoff fills, newer audio replaces the retained
packet and the replacement is counted as a drop. The main thread also discards
packets older than 100 ms of AudioContext time. The SDK's
`sendRealtimeInput` is synchronous and does not expose WebSocket buffer depth;
these safeguards bound the app's worklet handoff, not the SDK's internal socket
buffer. Diagnostics shows effective and track rates, output format, packet
target, and cumulative drops. Input packet and byte metrics count calls actually
passed to the Gemini SDK, after mute and stale-packet filtering.

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
3. Observe clear acknowledgment latency in the Diagnostics panel. It measures main-thread request to worklet acknowledgment, not physical speaker latency.

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
   - **Worklet Clear Acknowledgment:** Trend of `p50(clear_request_to_acknowledgment_ms)` on `voice_playback_clear_acknowledged`
