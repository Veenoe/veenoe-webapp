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

The output queue uses a 100 ms startup target and a separate 4 s hard capacity. Chunks waiting on `MessagePort` have their own 4 s limit. Overflow clears the queue, stops the session playback path, and surfaces a safe error. These are initial product policy values; tune only with real browser observations.
