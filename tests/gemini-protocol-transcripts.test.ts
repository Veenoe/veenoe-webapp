import assert from "node:assert/strict";
import test from "node:test";
import { processGeminiMessage } from "../lib/gemini/message-processor";
import { TranscriptAssembler } from "../lib/gemini/transcript-assembler";
import { useVivaStore } from "../lib/store/viva-store";
import { GeminiLiveClientSDK } from "../lib/gemini/live-client-sdk";

// Synthetic SDK-shaped fixtures. They are not captured Live traffic.
test("voice activity and waiting signals survive alongside response content", () => {
  assert.deepEqual(
    processGeminiMessage({
      voiceActivity: { voiceActivityType: "ACTIVITY_END", audioOffset: "2s" },
      serverContent: {
        waitingForInput: true,
        inputTranscription: { text: "Could you explain?" },
      },
    }),
    [
      { type: "voice_activity", activity: "end" },
      { type: "waiting_for_input" },
      {
        type: "transcription",
        source: "input",
        text: "Could you explain?",
        finished: undefined,
      },
    ],
  );
  assert.deepEqual(
    processGeminiMessage({
      voiceActivity: { voiceActivityType: "ACTIVITY_START" },
    }),
    [{ type: "voice_activity", activity: "start" }],
  );
  assert.deepEqual(
    processGeminiMessage({
      voiceActivity: { voiceActivityType: "TYPE_UNSPECIFIED" },
    }),
    [],
  );
  assert.deepEqual(processGeminiMessage({ voiceActivity: "invalid" }), [
    { type: "protocol_issue", field: "voiceActivity" },
  ]);
});
test("recovery preserves transcripts and starts independent streams after reconnection", () => {
  useVivaStore.getState().resetSession();
  let next = 0;
  const assembler = new TranscriptAssembler(
    (entry) => useVivaStore.getState().upsertTranscript(entry),
    () => `segment-${++next}`,
  );
  assembler.accept({ type: "transcription", source: "input", text: "before" });
  assembler.accept({
    type: "transcription",
    source: "output",
    text: "opening",
  });
  assembler.connectionClosed();
  assembler.connectionClosed();
  assembler.accept({
    type: "transcription",
    source: "input",
    text: "after",
    finished: true,
  });
  assembler.accept({
    type: "transcription",
    source: "output",
    text: "resumed",
    finished: true,
  });
  assert.deepEqual(
    useVivaStore
      .getState()
      .transcripts.map(({ text, completion }) => ({ text, completion })),
    [
      { text: "before", completion: "local" },
      { text: "opening", completion: "local" },
      { text: "after", completion: "protocol" },
      { text: "resumed", completion: "protocol" },
    ],
  );
  useVivaStore.getState().resetSession();
});

test("normalizer retains sibling facts and clears audio before student text", () => {
  const events = processGeminiMessage({
    setupComplete: {},
    serverContent: {
      interrupted: true,
      inputTranscription: { text: "yes", finished: true },
      modelTurn: {
        parts: [
          { inlineData: { data: "stale", mimeType: "audio/pcm;rate=24000" } },
        ],
      },
      generationComplete: true,
      turnComplete: true,
    },
  });
  assert.deepEqual(events, [
    { type: "setup_complete" },
    { type: "interrupted" },
    { type: "transcription", source: "input", text: "yes", finished: true },
    { type: "generation_complete" },
    { type: "turn_complete" },
  ]);
});

test("normalizer rejects malformed siblings without losing valid transcription or protocol metadata", () => {
  assert.deepEqual(
    processGeminiMessage({
      serverContent: {
        inputTranscription: { text: 5 },
        outputTranscription: { text: "spoken" },
        modelTurn: {
          parts: [
            { text: "thought", thought: true },
            { inlineData: { data: "image", mimeType: "image/png" } },
          ],
        },
      },
    }),
    [
      { type: "protocol_issue", field: "inputTranscription" },
      {
        type: "transcription",
        source: "output",
        text: "spoken",
        finished: undefined,
      },
      { type: "protocol_issue", field: "modelTurn.inlineData" },
    ],
  );
  assert.deepEqual(
    processGeminiMessage({
      goAway: { timeLeft: "12s" },
      sessionResumptionUpdate: {
        resumable: false,
        lastConsumedClientMessageIndex: "9007199254740993",
      },
      toolCallCancellation: { ids: ["call-1"] },
    }),
    [
      { type: "tool_call_cancellation", ids: ["call-1"] },
      { type: "go_away", timeLeft: "12s" },
      {
        type: "resumption_update",
        resumable: false,
        newHandle: undefined,
        lastConsumedClientMessageIndex: "9007199254740993",
      },
    ],
  );
});

test("canonical input replaces a revisable preview without assuming later input is a delta", () => {
  useVivaStore.getState().resetSession();
  let next = 0;
  const assembler = new TranscriptAssembler(
    (entry) => useVivaStore.getState().upsertTranscript(entry),
    () => `segment-${++next}`,
  );
  assembler.accept({
    type: "transcription",
    source: "interim_input",
    text: "I can",
  });
  assembler.accept({
    type: "transcription",
    source: "interim_input",
    text: "I cannot",
  });
  assembler.accept({ type: "transcription", source: "input", text: "I can" });
  assembler.accept({ type: "transcription", source: "input", finished: true });
  assembler.accept({ type: "transcription", source: "input", finished: true });
  assembler.accept({
    type: "transcription",
    source: "output",
    text: "no no",
    finished: true,
  });
  assembler.closeOutputTurn();
  assembler.accept({
    type: "transcription",
    source: "input",
    text: "I can",
    finished: true,
  });
  const rows = useVivaStore.getState().transcripts;
  assert.deepEqual(
    rows.map(({ id, role, text, isFinal }) => ({ id, role, text, isFinal })),
    [
      { id: "segment-1", role: "user", text: "I can", isFinal: true },
      { id: "segment-2", role: "assistant", text: "no no", isFinal: true },
      { id: "segment-3", role: "user", text: "I can", isFinal: true },
    ],
  );
  assembler.reset();
  useVivaStore.getState().resetSession();
});

test("unmarked canonical messages remain separate and assistant turn completion never finalizes input", () => {
  const entries: Array<{ role: string; completion: string; text: string }> = [];
  const assembler = new TranscriptAssembler((entry) => entries.push(entry));
  assembler.accept({ type: "transcription", source: "input", text: "student" });
  assembler.accept({
    type: "transcription",
    source: "output",
    text: "assistant",
  });
  assembler.closeOutputTurn();
  assert.equal(entries.at(-1)?.completion, "local");
  assembler.accept({
    type: "transcription",
    source: "input",
    text: " continued",
    finished: true,
  });
  assert.equal(entries.at(-1)?.text, " continued");
  assert.equal(entries.at(-1)?.completion, "protocol");
  assert.deepEqual(
    entries.filter((entry) => entry.role === "user").map((entry) => entry.text),
    ["student", " continued", " continued"],
  );
});

test("two canonical input messages without finished cannot be safely merged or called final", () => {
  useVivaStore.getState().resetSession();
  let next = 0;
  const assembler = new TranscriptAssembler(
    (entry) => useVivaStore.getState().upsertTranscript(entry),
    () => `segment-${++next}`,
  );
  assembler.accept({ type: "transcription", source: "input", text: "no no" });
  assembler.accept({ type: "transcription", source: "input", text: "no no" });
  assembler.closeOutputTurn();
  assert.deepEqual(
    useVivaStore
      .getState()
      .transcripts.map(({ text, isFinal, completion }) => ({
        text,
        isFinal,
        completion,
      })),
    [
      { text: "no no", isFinal: false, completion: "open" },
      { text: "no no", isFinal: false, completion: "open" },
    ],
  );
  useVivaStore.getState().resetSession();
});

test("outgoing tool response requires live transport and retains the server call ID", () => {
  const client = new GeminiLiveClientSDK("auth_tokens/test");
  assert.equal(
    client.sendToolResponse("call-1", "lookup", { ok: true }),
    false,
  );
  const sent: unknown[] = [];
  Object.assign(client, {
    session: { sendToolResponse: (value: unknown) => sent.push(value) },
    transportOpen: true,
    setupReady: true,
  });
  assert.equal(client.sendToolResponse("", "lookup", { ok: true }), false);
  assert.equal(client.sendToolResponse("call-1", "lookup", { ok: true }), true);
  assert.deepEqual(sent, [
    {
      functionResponses: [
        { id: "call-1", name: "lookup", response: { ok: true } },
      ],
    },
  ]);
});

test("message pump recovers from malformed input and throwing observer", async () => {
  let ready = 0;
  let issues = 0;
  const client = new GeminiLiveClientSDK("auth_tokens/test", {
    onEvent: (event) => {
      if (event.type === "protocol_issue") issues++;
      if (event.type === "setup_complete") throw new Error("observer failed");
    },
    onSetupComplete: () => {
      ready++;
    },
  });
  const pump = client as unknown as {
    responseQueue: unknown[];
    processMessages: () => Promise<void>;
    isProcessing: boolean;
  };
  pump.responseQueue.push(null, { setupComplete: {} }, { setupComplete: {} });
  await pump.processMessages();
  assert.equal(issues, 3);
  assert.equal(ready, 2);
  assert.equal(pump.isProcessing, false);
  pump.responseQueue.push({ setupComplete: {} });
  await pump.processMessages();
  assert.equal(ready, 3);
});
