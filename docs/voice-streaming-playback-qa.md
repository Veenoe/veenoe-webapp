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

For the next live run, copy Voice Diagnostics JSON after any audible gap or interruption. Compare transferred, stored, played, cleared, and rejected sample counts, plus queue depth and waiting silence. These are PCM accounting values, not a transcript or a claim about which word was missed. Check whether a server interruption coincided with cleared samples. Repeat the disconnect test and confirm the final audio drains and the session closes without refresh. Verify English speech during nearby voices and noise.
