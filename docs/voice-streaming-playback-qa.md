# VEENOE-22 streaming playback QA

Automated checks exercise the production PCM queue and worklet scripts. Real microphone, speaker, browser autoplay, and Gemini network timing still require a live session. No physical playback QA was performed in this implementation environment.

Record browser/version, OS, speaker type, and Voice Diagnostics queue maximum and underrun count for each run. Use a normal account and the existing Voice Diagnostics panel; do not record audio or transcripts.

| Scenario | What to observe | Result |
| --- | --- | --- |
| Multi-sentence and longer response | Continuous speech; one output worklet node; no growing source count | Pending live QA |
| Several consecutive turns | Smooth starts and completed drains | Pending live QA |
| Intentional barge-in | Speech stops immediately; old speech never resumes | Pending live QA |
| New response after interruption | Starts cleanly after the 100 ms prebuffer | Pending live QA |
| Mute and full duplex | Microphone behavior remains unchanged during playback | Pending live QA |
| Final goodbye/conclusion | Session waits for queued audio to drain | Pending live QA |
| End or leave session | Output node disconnects and AudioContext closes | Pending live QA |
| Diagnostics | Queue maximum and underrun count reflect audible behavior | Pending live QA |

The output queue uses a 100 ms startup target and a separate 30 s hard capacity (1.44 MB of PCM). Chunks waiting on `MessagePort` have their own 4 s limit. The latest live snapshot reached 7953 ms before overflowing the previous 8 s queue. Gemini delivered audio faster than playback consumed it, so the hard limit must accommodate normal full responses without changing the low-latency startup target. Overflow remains a terminal playback error; the session must not resume after discarded audio.

## Ownership and measurements

The player owns the context and one worklet until cleanup. A response generation owns its pending encoded chunks and in-flight PCM reservations. Stop cancels that generation; cleanup permanently disposes the player. The worklet accepts only the generation specified at creation or a later clear. Completion follows admitted PCM in MessagePort order.

The pending encoded FIFO has a four-second equivalent limit (256,000 base64 characters); unacknowledged PCM has a separate four-second limit (192,000 bytes). Transfer pauses at the latter limit and resumes on per-chunk acceptance. The worklet's 30-second ring is separate, so normal long speech can queue there. The 100 ms startup threshold measures queued samples and adds no mandatory wall-clock sleep.

Worklet queue and rendered-sample snapshots arrive at most every 500 ms while active, plus start, drain, and clear events. `storedSamples = playedSamples + clearedSamples + currently queued samples`; `playedSamples` means consumed by the renderer, not acoustically emitted. The interruption metric measures elapsed time from a main-thread clear request to its matching worklet acknowledgment. Missing acknowledgments remain unknown. Last-turn underruns and session-wide underruns have separate labels.

Automated verification: the production player, worklet, and PCM queue run together under asynchronous fake MessagePorts in `tests/audio-player.test.ts`; targeted tests cover module-load and resume cancellation, disposal, admission, 15-second queued speech, duplicate acknowledgments, periodic depth, observer failures, and clear correlation. Physical playback, autoplay behavior, speaker latency, and real network timing still require the live matrix above. Earlier live observations remain historical evidence of the preceding implementation, not verification of these changes.

Validation for this revision: `npm test` (77 passed), `npx tsc --noEmit`, ESLint on touched files, `npm run build`, and `git diff --check` passed. Repository-wide `npm run lint` still reports 25 errors and 21 warnings in unchanged files. There is no configured formatter command.

For the next live run, copy Voice Diagnostics JSON after any audible gap or interruption. Compare transferred, stored, played, cleared, and rejected sample counts, plus queue depth and waiting silence. These are PCM accounting values, not a transcript or a claim about which word was missed. Check whether a server interruption coincided with cleared samples. Repeat the disconnect test and confirm the final audio drains and the session closes without refresh. Verify English speech during nearby voices and noise.
