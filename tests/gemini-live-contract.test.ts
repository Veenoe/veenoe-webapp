import assert from "node:assert/strict";
import test from "node:test";
import {
  Live,
  Modality,
  type LiveCallbacks,
  type Session,
  type LiveServerMessage,
} from "@google/genai";
import { createToolHandler } from "../lib/hooks/viva/tool-handlers";
import { createAudioPipeline } from "../lib/hooks/viva/audio-pipeline";
import { useVivaStore } from "../lib/store/viva-store";

import {
  createGeminiClientContent,
  createGeminiLiveConfig,
  GEMINI_LIVE_API_VERSION,
  GeminiLiveClientSDK,
} from "../lib/gemini/live-client-sdk";
import { processGeminiMessage } from "../lib/gemini/message-processor";

test("uses the ephemeral-token API version and client-controlled resumption", () => {
  assert.equal(
    createGeminiLiveConfig(true).sessionResumption?.handle,
    undefined,
  );
  assert.equal(GEMINI_LIVE_API_VERSION, "v1beta");
});

test("audio send only counts calls accepted by an open SDK transport", () => {
  let errors = 0;
  const client = new GeminiLiveClientSDK("auth_tokens/test", {
    onError: () => {
      errors++;
    },
  });
  const internal = client as unknown as {
    session: { sendRealtimeInput: (value: unknown) => void };
    transportOpen: boolean;
    setupReady: boolean;
  };
  let calls = 0;
  internal.session = {
    sendRealtimeInput: () => {
      calls++;
    },
  };
  internal.transportOpen = false;
  assert.equal(client.sendAudio(new ArrayBuffer(640)), false);
  assert.equal(calls, 0);
  internal.transportOpen = true;
  internal.setupReady = true;
  assert.equal(client.sendAudio(new ArrayBuffer(640)), true);
  assert.equal(calls, 1);
  internal.session.sendRealtimeInput = () => {
    throw new Error("socket closed");
  };
  let synchronousFailures = 0;
  assert.equal(
    client.sendAudio(new ArrayBuffer(640), () => {
      synchronousFailures++;
    }),
    false,
  );
  assert.equal(synchronousFailures, 1);
  assert.equal(errors, 1);
  assert.equal(internal.transportOpen, false);
});

test("stream-end send failures use existing transport failure handling", () => {
  let errors = 0;
  let calls = 0;
  const client = new GeminiLiveClientSDK("auth_tokens/test", {
    onError: () => {
      errors++;
    },
  });
  const internal = client as unknown as {
    session: { sendRealtimeInput: (value: unknown) => void };
    transportOpen: boolean;
    setupReady: boolean;
  };
  internal.session = {
    sendRealtimeInput: () => {
      calls++;
    },
  };
  internal.transportOpen = true;
  internal.setupReady = true;
  assert.equal(client.sendAudio(new ArrayBuffer(640)), true);
  internal.setupReady = false;
  assert.equal(client.endAudioStream(), false);
  assert.equal(calls, 1);
  internal.setupReady = true;
  internal.session.sendRealtimeInput = () => {
    throw new Error("private transport error");
  };
  assert.equal(client.endAudioStream(), false);
  assert.equal(errors, 1);
  assert.equal(client.endAudioStream(), false);
  assert.equal(errors, 1);
});

test("text send and connection state both require an open transport", () => {
  let errors = 0;
  const client = new GeminiLiveClientSDK("auth_tokens/test", {
    onError: () => {
      errors++;
    },
  });
  const internal = client as unknown as {
    session: { sendClientContent: (value: unknown) => void } | null;
    transportOpen: boolean;
    setupReady: boolean;
  };
  let calls = 0;
  internal.session = {
    sendClientContent: () => {
      calls++;
    },
  };
  internal.transportOpen = false;
  assert.equal(client.sendText("conclude"), false);
  assert.equal(calls, 0);
  assert.equal(client.getConnectionState(), "disconnected");

  internal.transportOpen = true;
  internal.setupReady = true;
  assert.equal(client.sendText("conclude"), true);
  assert.equal(calls, 1);
  assert.equal(client.getConnectionState(), "connected");

  internal.session.sendClientContent = () => {
    throw new Error("socket closed");
  };
  assert.equal(client.sendText("conclude"), false);
  assert.equal(errors, 1);
  assert.equal(internal.transportOpen, false);
  assert.equal(client.getConnectionState(), "disconnected");

  internal.session = null;
  internal.transportOpen = true;
  internal.setupReady = true;
  assert.equal(client.sendText("conclude"), false);
  assert.equal(client.getConnectionState(), "disconnected");
});

test("disconnect during Live setup closes a late session and ignores stale callbacks", async () => {
  const originalConnect = Live.prototype.connect;
  let callbacks: LiveCallbacks | null = null;
  let resolveSession!: (session: Session) => void;
  const pending = new Promise<Session>((resolve) => {
    resolveSession = resolve;
  });
  Live.prototype.connect = async (params) => {
    callbacks = params.callbacks;
    return pending;
  };
  let connected = 0;
  let errors = 0;
  let disconnected = 0;
  let closed = 0;
  try {
    const client = new GeminiLiveClientSDK("auth_tokens/test", {
      onConnected: () => {
        connected++;
      },
      onError: () => {
        errors++;
      },
      onDisconnected: () => {
        disconnected++;
      },
    });
    (client as unknown as { modelName: string }).modelName = "backend-model";
    const connecting = client.connect();
    callbacks!.onopen?.();
    assert.equal(connected, 1);
    client.disconnect();
    callbacks!.onopen?.();
    callbacks!.onerror?.({} as ErrorEvent);
    callbacks!.onclose?.({} as CloseEvent);
    resolveSession({
      close: () => {
        closed++;
      },
    } as Session);
    await connecting;
    assert.deepEqual([connected, errors, disconnected, closed], [1, 0, 0, 1]);
    assert.equal(client.getConnectionState(), "disconnected");
  } finally {
    Live.prototype.connect = originalConnect;
  }
});

test("disconnect during retry delay prevents another Live connection", async () => {
  const originalConnect = Live.prototype.connect;
  let attempts = 0;
  Live.prototype.connect = async () => {
    attempts++;
    throw new Error("connect failed");
  };
  let releaseDelay!: () => void;
  let retries = 0;
  let errors = 0;
  try {
    const client = new GeminiLiveClientSDK("auth_tokens/test", {
      onReconnectAttempt: () => {
        retries++;
      },
      onError: () => {
        errors++;
      },
    });
    (client as unknown as { delay: () => Promise<void> }).delay = () =>
      new Promise((resolve) => {
        releaseDelay = resolve;
      });
    (client as unknown as { modelName: string }).modelName = "backend-model";
    const connecting = client.connect();
    await new Promise((resolve) => setImmediate(resolve));
    assert.deepEqual([attempts, retries], [1, 1]);
    client.disconnect();
    releaseDelay();
    await connecting;
    assert.deepEqual([attempts, retries, errors], [1, 1, 0]);
  } finally {
    Live.prototype.connect = originalConnect;
  }
});

test("uses audio response without duplicating backend VAD or voice", () => {
  const config = createGeminiLiveConfig();
  assert.equal(config.realtimeInputConfig, undefined);
  assert.equal(config.speechConfig, undefined);
  assert.deepEqual(config, {
    responseModalities: [Modality.AUDIO],
  });
});

test("sends the end-viva prompt as a completed user text turn", () => {
  assert.deepEqual(createGeminiClientContent("Please conclude the viva."), {
    turns: [{ role: "user", parts: [{ text: "Please conclude the viva." }] }],
    turnComplete: true,
  });
});

test("normalizes conclude_viva calls for the existing local handler", () => {
  const args = { score: 8, summary: "Good work", strong_points: ["Reasoning"] };
  assert.deepEqual(
    processGeminiMessage({
      toolCall: {
        functionCalls: [{ id: "call-1", name: "conclude_viva", args }],
      },
    }),
    [{ type: "tool_call", id: "call-1", name: "conclude_viva", args }],
  );
});

test("SDK terminal dispatch saves once, drains buffered audio, and sends no Gemini response", async () => {
  useVivaStore.getState().resetSession();
  useVivaStore.setState({ sessionId: "session-one" });
  const originalConnect = Live.prototype.connect;
  let callbacks: LiveCallbacks | undefined;
  let toolResponses = 0;
  let playbackCompletions = 0;
  let writes = 0;
  let finished = 0;
  const conclusionPending = { current: false };
  const pipeline = createAudioPipeline({
    setConversationState: () => {},
    setPlaybackState: () => {},
    isConclusionPendingRef: conclusionPending,
    isTurnCompleteRef: { current: false },
    isAudioPlayingRef: { current: true },
    finishConclusion: () => {
      finished++;
    },
  });
  const handler = createToolHandler({
    setError: () => assert.fail("valid conclusion must not error"),
    finishConclusion: () => {
      finished++;
    },
    hasPendingPlayback: () => true,
    isConclusionPendingRef: conclusionPending,
    getToken: async () => null,
    onTerminalCallAccepted: () => {
      playbackCompletions++;
    },
    saveConclusion: async () => {
      writes++;
      return { status: "completed", score: 8, final_feedback: "done" };
    },
  });
  const completed: Promise<void>[] = [];
  Live.prototype.connect = async (params) => {
    callbacks = params.callbacks;
    params.callbacks.onopen?.();
    params.callbacks.onmessage({ setupComplete: {} } as LiveServerMessage);
    return {
      // The real provider acknowledges setup before a connection becomes usable.
      close: () => {},
      sendToolResponse: () => {
        toolResponses++;
      },
    } as unknown as Session;
  };
  try {
    const client = new GeminiLiveClientSDK(
      "auth_tokens/test",
      {
        onEvent: (event) => {
          if (event.type !== "tool_call") return;
          completed.push(
            new Promise((resolve) => {
              queueMicrotask(() => {
                void handler(event.name, event.args, event.id).then(resolve);
              });
            }),
          );
        },
      },
      "backend-model",
    );
    await client.connect();
    const call = {
      id: "call-1",
      name: "conclude_viva",
      args: {
        score: 8,
        summary: "done",
        strong_points: [],
        areas_of_improvement: [],
      },
    };
    callbacks!.onmessage?.({
      toolCall: { functionCalls: [call, { ...call, id: "call-2" }] },
    } as unknown as LiveServerMessage);
    await Promise.all(completed);
    assert.equal(writes, 1);
    assert.equal(playbackCompletions, 1);
    assert.equal(toolResponses, 0);
    assert.equal(conclusionPending.current, true);
    assert.equal(finished, 0);
    pipeline.createPlaybackCallbacks().onPlayEnd?.();
    assert.equal(finished, 1);
    client.disconnect();
  } finally {
    Live.prototype.connect = originalConnect;
    useVivaStore.getState().resetSession();
  }
});
