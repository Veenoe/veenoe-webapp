# VEENOE-24 Live protocol and transcript QA

The browser uses `@google/genai` 2.24.0 with `gemini-3.8-live` on `v1beta`. The backend token remains authoritative for AUDIO, VAD, voice, transcription, and session resumption. Fixtures in `gemini-protocol-transcripts.test.ts` are synthetic SDK-shaped messages, not recorded traffic.

## Event mapping and ownership

The adapter emits typed setup, input/interim/output transcription, PCM audio, generation completion, turn completion, interruption, function call/cancellation, GoAway, and resumption events. Invalid known fields produce a bounded field-name diagnostic; unknown fields are ignored. The only accepted playback payload is `audio/pcm;rate=24000` inline data, matching the existing PCM player. Model text, including thought parts, is not a caption source in the AUDIO flow. Output transcription is the assistant caption source.

Socket open, setup complete with a usable SDK session, generation complete, turn complete, playback drain, and transcription `finished` are separate facts. The existing setup/session readiness gate starts the microphone. Interruption clears playback before sibling transcription is applied. Generation completion never drains the player. GoAway warns of a future closure and does not abandon the viva.

Interim input text replaces the current preview. Canonical input and output text are treated as sequential fragments and appended without trimming or overlap guesses. A `finished` update may arrive without text and finalizes the active segment. Turn completion locally closes output text if the optional transcription completion was absent; this remains marked as local closure, not protocol-confirmed completion. Student text is never finalized by assistant turn completion. IDs are generated once per local segment and rows are updated by ID. A later independent input segment may legitimately repeat the same words.

The Live reference says input transcription has no guaranteed ordering relative to model turns, and output transcription's last update precedes generation completion or interruption. It does not promise replay IDs or specify all delta/snapshot behavior for this conversational model. The fragment and preview interpretation needs manual validation with observed 3.8 Live traffic. Arbitrary replay deduplication is impossible without server segment identity. We do not infer completion or spoken status from text alone.

Function calls retain server IDs. Calls without IDs or valid conclusion arguments cannot start the terminal backend write. Cancellation before dispatch or while awaiting an auth token prevents that write; after the write starts, cancellation cannot undo it. The backend remains authoritative for terminal races. The terminal `conclude_viva` policy is unchanged: save once per viva session, drain queued final audio, then close **without** a Gemini function response or another turn-complete dependency. A narrow outgoing `sendToolResponse` method exists for nonterminal correlated calls but is not used for conclusion.

GoAway and resumption metadata are exposed without logging handles. `resumable: false` is preserved, and the consumed message index stays a string. VEENOE-23 owns reconnect, token refresh, replay, and persisted resumption state; parsing an update does not mean resumption is operational.

## Manual live QA (pending)

Use a normal account and the existing anonymous Voice Diagnostics panel. Record browser/OS, speaker and microphone, frontend/backend revisions, and telemetry JSON without transcripts, audio, or credentials.

1. Start a viva; confirm socket opens, setup completes, and microphone forwarding begins.
2. Alternate student and assistant turns; check role, caption, audio, and finality.
3. Pause and correct a phrase; check the interim preview changes and the canonical result replaces it.
4. Give two separate identical answers and repeat a word within one answer; check both cases remain intact.
5. Interrupt assistant speech, then continue; confirm stale audio stays cleared and student text survives.
6. Request conclusion; confirm final audio drains, one result is saved, and the session closes.
7. Let the model initiate conclusion; verify the same terminal behavior.
8. Close the connection unexpectedly; confirm abandonment follows the actual close, not GoAway.

No browser/audio/Gemini live QA was performed for this change.
