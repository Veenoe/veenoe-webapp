# VEENOE-24 Live protocol and transcript QA

The browser uses `@google/genai` 2.24.0 with `gemini-3.8-live` on `v1beta`. The backend token remains authoritative for AUDIO, VAD, voice, transcription, and session resumption. Fixtures in `gemini-protocol-transcripts.test.ts` are synthetic SDK-shaped messages, not recorded traffic.

## Event mapping and ownership

The adapter emits typed setup, input/interim/output transcription, PCM audio, generation completion, turn completion, interruption, function call/cancellation, GoAway, and resumption events. Invalid known fields produce a bounded field-name diagnostic; unknown fields are ignored. The only accepted playback payload is `audio/pcm;rate=24000` inline data, matching the existing PCM player. Model text, including thought parts, is not a caption source in the AUDIO flow. Output transcription is the assistant caption source.

Socket open, setup complete with a usable SDK session, generation complete, turn complete, playback drain, and transcription `finished` are separate facts. The existing setup/session readiness gate starts the microphone. Interruption clears playback before sibling transcription is applied. Generation completion never drains the player. GoAway warns of a future closure and does not abandon the viva.

Interim input text replaces the current preview. The first canonical input message replaces that preview. Subsequent canonical input messages are preserved as separate local segments: the conversational 3.8 Live reference does not say whether each message is a delta, a snapshot, or a complete utterance. Concatenation would risk duplicate corrections or merged student utterances. This conservative policy may display separate fragments of one utterance until a real 3.8 trace establishes a safe grouping rule. Output text remains appended as sequential fragments within the model turn. A `finished` update may arrive without text and finalizes the latest known canonical segment. If `finished` is absent, student text stays open; assistant turn completion never certifies a student's utterance. Turn completion locally closes output text if its optional transcription completion was absent, marked as local closure rather than protocol-confirmed completion. IDs are generated once per local segment and rows are updated by ID. Separate messages may legitimately contain identical words.

The Live reference says input transcription has no guaranteed ordering relative to model turns, and output transcription's last update precedes generation completion or interruption. It does not promise replay IDs or specify all delta/snapshot behavior for this conversational model. Before merge, a live 3.8 session should establish the input message sequence and whether canonical messages are deltas, snapshots, or complete segments. Observe event names, `finished` presence, and ordering locally without sending transcript text to telemetry. If this cannot be verified, keep student segment grouping conservative and record the remaining display limitation. Arbitrary replay deduplication is impossible without server segment identity. We do not infer completion or spoken status from text alone.

Function calls retain server IDs. Calls without IDs or valid conclusion arguments cannot start the terminal backend write. Cancellation before dispatch or while awaiting an auth token prevents that write; after the write starts, cancellation cannot undo it. The backend remains authoritative for terminal races. The terminal `conclude_viva` policy is unchanged: save once per viva session, drain queued final audio, then close **without** a Gemini function response or another turn-complete dependency. A narrow outgoing `sendToolResponse` method exists for nonterminal correlated calls but is not used for conclusion.

GoAway and resumption metadata are exposed without logging handles. `resumable: false` is preserved, and the consumed message index stays a string. VEENOE-23 owns reconnect, token refresh, replay, and persisted resumption state; parsing an update does not mean resumption is operational.

Conclusion generates and saves one report through the existing tool with score, summary, strengths, areas for improvement, next steps and coverage note. Older calls may omit the new fields. Extra calls are ignored before payload validation once that session is saving or saved, including malformed duplicates. Final audio drains before disconnect. An invalid conclusion closes the spoken-response boundary and exits through the existing abandonment/completion check; if the backend already completed the session, that check opens its saved report. Validation diagnostics contain fixed field paths only, never report contents. Timer expiry requests the same spoken closing and conclusion as the end-session button, rather than merely changing the UI state. The guidance is stored with the existing report; no second report generation is requested.

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
