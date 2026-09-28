# VEENOE-21 microphone QA

Run with Voice Diagnostics enabled. Use a real Gemini Live session and keep the microphone live while Gemini speaks. Record browser/version, OS, and coarse microphone type (built-in, wired headset, or Bluetooth). Do not record labels or device IDs. Copy the diagnostics JSON and retain only the microphone configuration, format, level, and interruption counters needed for analysis.

For every row, record applied echo cancellation, noise suppression, AGC, track sample rate/channel count, Web Audio rate, approximate RMS/peak dBFS, whether Gemini self-interrupted, and a short usability note. “Unreported” is distinct from false. Compare with a quiet-room baseline on the same setup.

Result template: `browser/version | OS | built-in/wired/Bluetooth | applied AEC/NS/AGC | track Hz/channels | Web Audio Hz | approximate RMS/peak dBFS | self-interruption yes/no | usability note`.

| Scenario | Procedure | Result |
| --- | --- | --- |
| Quiet room baseline | Speak normally for two turns. | Pending physical QA |
| Laptop speaker echo | Use normal laptop speakers, not headphones. Let Gemini speak at normal volume with full-duplex capture; then interrupt it intentionally. Check for repeated self-interruption before your speech. Keep barge-in enabled. | Pending physical QA |
| Fan or AC | Place the normal setup near constant fan/AC noise and converse. | Pending physical QA |
| Keyboard typing | Type during Gemini speech and your answer. | Pending physical QA |
| Traffic | Converse near traffic or a representative open window. | Pending physical QA |
| Cafe-style noise | Converse in a cafe-like environment. | Pending physical QA |
| Nearby speech | Have another person speak nearby during a turn. | Pending physical QA |
| Low microphone input | Speak quietly or use a low-input device; inspect RMS and intelligibility. | Pending physical QA |
| Very loud input | Speak close/loudly; inspect peak and ≥98% sample ratio for near-clipping. | Pending physical QA |
| Device loss | Unplug or revoke the active microphone; confirm the error, stopped capture, and abandoned session. | Pending physical QA |

Repeat the speaker test in the primary supported browsers and note browser/version and OS for each run. Confirm mute, ordinary interruption, and clean session conclusion still work. A browser reporting AEC enabled does not by itself prove effective echo removal; judge the actual interaction.

## Denoiser decision

**No-go for an additional denoiser in VEENOE-21.** A user-reported household-noise trial with a nearby speaker at full volume remained understandable and was not interrupted by other noisy voices. The supplied diagnostic snapshot showed applied AEC/NS/AGC all `true`, mono 48 kHz capture resampled to 16 kHz, recent RMS −43.8 dBFS, peak −28.5 dBFS, zero near-clipped samples, zero microphone/connection errors, and 77 dropped input packets out of approximately 5,969 attempted (about 1.3%). Its bounded recent-event timeline contained no interruption. A prior noisy trial had two interruptions; the snapshot cannot attribute them to user speech, speaker echo, or environmental voices. Browser/version, OS, microphone type, and isolated scenario measurements were not recorded, so primary-browser echo and environmental-noise acceptance still require the matrix above. These observations do not justify extra DSP now. If native processing proves insufficient, propose DSP only with before/after scenario evidence, measurable benefit, added end-to-end latency, CPU and memory cost, browser/mobile impact, AudioWorklet implications, audible artifacts, and maintenance cost.
