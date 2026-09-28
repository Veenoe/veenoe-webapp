# Streaming playback ownership

An `AudioPlayer` owns one browser context and output worklet for its lifetime. A generation owns one response's admitted chunks, completion, and interruption clear. `stop()` advances the generation and discards its audio; `cleanup()` disposes the player permanently. Delayed setup or resume may publish resources only while the player still owns them.

Before transfer, the player owns encoded chunks in a bounded FIFO. After transfer, it owns an in-flight byte reservation until the worklet acknowledges acceptance or rejection. The worklet owns accepted PCM in its bounded ring. Completion follows all admitted chunks; interruption cancels them without producing a normal playback end. Failed playback is terminal for this player.

Queue depth counts PCM held in the worklet. Pending encoded bytes and unacknowledged PCM bytes are separate budgets. `storedSamples` counts accepted PCM; `renderedSamples` counts samples consumed by the renderer, `clearedSamples` counts accepted samples discarded, and `rejectedSamples` counts submissions the worklet did not store. `stored = rendered + cleared + queued`. None of these prove sound reached the speaker. Clear acknowledgment latency measures main-thread request to receipt of the matching worklet acknowledgment; it is not acoustic stop latency.
