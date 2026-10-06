import assert from "node:assert/strict";
import test from "node:test";
import { createToolHandler } from "../lib/hooks/viva/tool-handlers";
import { createAudioPipeline } from "../lib/hooks/viva/audio-pipeline";
import { useVivaStore } from "../lib/store/viva-store";
import { ConversationState, PlaybackState } from "../types/viva";

test("conclusion saves actionable guidance in the same report exactly once", async () => {
  useVivaStore.getState().resetSession();
  useVivaStore.setState({ sessionId: "existing-report" });
  const report = {
    score: 7,
    summary:
      "Explained the cause after a meaningful hint; transfer was not tested in this short session.",
    strong_points: ["Identified the core concept independently."],
    areas_of_improvement: [
      "Practise explaining the cause without hints using a changed condition.",
    ],
    next_steps: [
      "Predict a changed outcome, then explain the cause without hints.",
    ],
    coverage_note: "One short session; transfer was not tested.",
  };
  let writes = 0;
  const handler = createToolHandler({
    setError: (error) => {
      assert.equal(error, null);
    },
    finishConclusion: () => {},
    hasPendingPlayback: () => false,
    isConclusionPendingRef: { current: false },
    getToken: async () => null,
    saveConclusion: async (payload) => {
      writes++;
      assert.deepEqual(payload, {
        viva_session_id: "existing-report",
        ...report,
      });
      return {
        status: "completed",
        score: payload.score,
        final_feedback: payload.summary,
      };
    },
  });
  try {
    // A stale experimental token's extra field cannot block the existing report.
    await handler(
      "conclude_viva",
      { ...report, assessment: { malformed: true } },
      "call-1",
    );
    await handler("conclude_viva", report, "call-2");
    assert.equal(writes, 1);
  } finally {
    useVivaStore.getState().resetSession();
  }
});

test("repeated Gemini conclusion calls save once per session", async () => {
  useVivaStore.getState().resetSession();
  useVivaStore.setState({ sessionId: "session-one" });
  let writes = 0;
  const handler = createToolHandler({
    setError: () => {},
    finishConclusion: () => {},
    hasPendingPlayback: () => true,
    isConclusionPendingRef: { current: false },
    getToken: async () => null,
    saveConclusion: async () => {
      writes++;
      return { status: "completed", score: 2, final_feedback: "done" };
    },
  });
  const args = {
    score: 2,
    summary: "done",
    strong_points: [],
    areas_of_improvement: [],
  };
  try {
    await Promise.all([
      handler("conclude_viva", args, "call-1"),
      handler("conclude_viva", args, "call-2"),
    ]);
    await handler("conclude_viva", args, "call-3");
    assert.equal(writes, 1);
    useVivaStore.setState({ sessionId: "session-two" });
    await handler("conclude_viva", args, "call-4");
    assert.equal(writes, 2);
  } finally {
    useVivaStore.getState().resetSession();
  }
});

test("failed feedback save requests abandonment instead of reporting completion", async () => {
  useVivaStore.getState().resetSession();
  useVivaStore.setState({ sessionId: "session-one" });
  let completed = 0;
  let abandoned = 0;
  const saving = { current: false };
  const handler = createToolHandler({
    setError: () => {},
    finishConclusion: () => {
      completed++;
    },
    hasPendingPlayback: () => false,
    isConclusionPendingRef: { current: false },
    isConclusionSavingRef: saving,
    getToken: async () => null,
    saveConclusion: async () => {
      throw new Error("offline");
    },
    abandonSession: async () => {
      abandoned++;
    },
  });
  try {
    await handler(
      "conclude_viva",
      {
        score: 2,
        summary: "done",
        strong_points: [],
        areas_of_improvement: [],
      },
      "call-1",
    );
    assert.equal(completed, 0);
    assert.equal(abandoned, 1);
    assert.equal(saving.current, false);
  } finally {
    useVivaStore.getState().resetSession();
  }
});

test("saved conclusion waits for queued audio even before playback starts", async () => {
  useVivaStore.getState().resetSession();
  useVivaStore.setState({ sessionId: "session-one" });
  const pending = { current: false };
  const playing = { current: false };
  let completed = 0;
  const finishConclusion = () => {
    completed++;
  };
  const pipeline = createAudioPipeline({
    setConversationState: () => {},
    setPlaybackState: () => {},
    isConclusionPendingRef: pending,
    isTurnCompleteRef: { current: true },
    isAudioPlayingRef: playing,
    finishConclusion,
  });
  const handler = createToolHandler({
    setError: () => {},
    finishConclusion,
    hasPendingPlayback: () => true,
    isConclusionPendingRef: pending,
    getToken: async () => null,
    saveConclusion: async () => ({
      status: "completed",
      score: 9,
      final_feedback: "done",
    }),
  });
  try {
    await handler(
      "conclude_viva",
      {
        score: 9,
        summary: "done",
        strong_points: [],
        areas_of_improvement: [],
      },
      "call-1",
    );
    assert.equal(pending.current, true);
    assert.equal(completed, 0);
    const playback = pipeline.createPlaybackCallbacks();
    playback.onPlayStart?.();
    playback.onPlayEnd?.();
    assert.equal(completed, 1);
  } finally {
    useVivaStore.getState().resetSession();
  }
});

test("throwing playback diagnostic does not prevent final conclusion", () => {
  const pending = { current: true };
  let finishes = 0;
  const pipeline = createAudioPipeline({
    setConversationState: () => {},
    setPlaybackState: () => {},
    isConclusionPendingRef: pending,
    isTurnCompleteRef: { current: true },
    isAudioPlayingRef: { current: true },
    finishConclusion: () => {
      finishes++;
    },
  });
  const oldError = console.error;
  console.error = () => {};
  try {
    const callbacks = pipeline.createPlaybackCallbacks({
      onPlayEnd: () => {
        throw new Error("diagnostics");
      },
    });
    callbacks.onPlayEnd?.();
    assert.equal(finishes, 1);
  } finally {
    console.error = oldError;
  }
});

test("cancelled call during token preparation never starts backend write", async () => {
  useVivaStore.getState().resetSession();
  useVivaStore.setState({ sessionId: "session-one" });
  let release!: (token: string) => void;
  let writes = 0;
  let terminalClaims = 0;
  const handler = createToolHandler({
    setError: () => {},
    finishConclusion: () => {},
    hasPendingPlayback: () => false,
    isConclusionPendingRef: { current: false },
    onTerminalCallAccepted: () => {
      terminalClaims++;
    },
    getToken: () =>
      new Promise((resolve) => {
        release = resolve;
      }),
    saveConclusion: async () => {
      writes++;
      return { status: "completed", score: 1, final_feedback: "done" };
    },
  });
  const args = {
    score: 1,
    summary: "done",
    strong_points: [],
    areas_of_improvement: [],
  };
  const pending = handler("conclude_viva", args, "call-1");
  handler.cancel(["call-1"]);
  release("token");
  await pending;
  assert.equal(writes, 0);
  assert.equal(terminalClaims, 0);
  useVivaStore.getState().resetSession();
});

test("missing correlation ID or invalid arguments cannot conclude the viva", async () => {
  useVivaStore.getState().resetSession();
  useVivaStore.setState({ sessionId: "session-one" });
  let writes = 0;
  const handler = createToolHandler({
    setError: () => {},
    finishConclusion: () => {},
    hasPendingPlayback: () => false,
    isConclusionPendingRef: { current: false },
    getToken: async () => null,
    saveConclusion: async () => {
      writes++;
      return { status: "completed", score: 1, final_feedback: "done" };
    },
  });
  await handler("conclude_viva", {
    score: 1,
    summary: "done",
    strong_points: [],
    areas_of_improvement: [],
  });
  await handler("conclude_viva", { score: 1 }, "call-1");
  assert.equal(writes, 0);
  useVivaStore.getState().resetSession();
});

test("malformed duplicate cannot invalidate a report already saving or saved", async () => {
  useVivaStore.getState().resetSession();
  useVivaStore.setState({ sessionId: "existing-report" });
  let release!: () => void;
  let writes = 0;
  let errors = 0;
  let failures = 0;
  const handler = createToolHandler({
    setError: (error) => {
      if (error) errors++;
    },
    finishConclusion: () => {},
    hasPendingPlayback: () => false,
    isConclusionPendingRef: { current: false },
    getToken: async () => null,
    onConclusionFailure: () => {
      failures++;
    },
    saveConclusion: async () => {
      writes++;
      await new Promise<void>((resolve) => {
        release = resolve;
      });
      return {
        status: "completed",
        score: 8,
        final_feedback: "existing report",
      };
    },
  });
  try {
    const saving = handler(
      "conclude_viva",
      {
        score: 8,
        summary: "existing report",
        strong_points: [],
        areas_of_improvement: [],
      },
      "original",
    );
    await Promise.resolve();
    await handler("conclude_viva", { score: 1 }, "duplicate-during-save");
    release();
    await saving;
    await handler("conclude_viva", {}, "duplicate-after-save");
    assert.equal(writes, 1);
    assert.equal(errors, 0);
    assert.equal(failures, 0);
  } finally {
    useVivaStore.getState().resetSession();
  }
});

test("invalid first conclusion clears stale speaking and exits without generating another report", async () => {
  useVivaStore.getState().resetSession();
  useVivaStore.setState({ sessionId: "invalid-report" });
  let conversation = ConversationState.SPEAKING;
  let playback = PlaybackState.PLAYING;
  const playing = { current: true };
  let boundary = 0;
  let failures = 0;
  let writes = 0;
  const pipeline = createAudioPipeline({
    setConversationState: (state) => {
      conversation = state;
    },
    setPlaybackState: (state) => {
      playback = state;
    },
    isConclusionPendingRef: { current: false },
    isTurnCompleteRef: { current: false },
    isAudioPlayingRef: playing,
    finishConclusion: () => {},
  });
  const callbacks = pipeline.createPlaybackCallbacks();
  const handler = createToolHandler({
    setError: () => {},
    finishConclusion: () => {},
    hasPendingPlayback: () => false,
    isConclusionPendingRef: { current: false },
    getToken: async () => null,
    onConclusionRejected: () => {
      pipeline.completeTurn(() => {
        boundary++;
      });
      callbacks.onPlayEnd?.();
    },
    onConclusionFailure: () => {
      failures++;
    },
    saveConclusion: async () => {
      writes++;
      return { status: "completed", score: 8, final_feedback: "done" };
    },
  });
  try {
    await handler(
      "conclude_viva",
      { score: 8, summary: "", strong_points: [], areas_of_improvement: [] },
      "invalid",
    );
    assert.equal(boundary, 1);
    assert.equal(conversation, ConversationState.LISTENING);
    assert.equal(playback, PlaybackState.IDLE);
    assert.equal(playing.current, false);
    assert.equal(failures, 1);
    await handler(
      "conclude_viva",
      {
        score: 8,
        summary: "done",
        strong_points: [],
        areas_of_improvement: [],
      },
      "late",
    );
    assert.equal(writes, 0);
    assert.equal(failures, 1);
  } finally {
    useVivaStore.getState().resetSession();
  }
});
