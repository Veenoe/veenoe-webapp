import assert from "node:assert/strict";
import test from "node:test";
import {
  Live,
  type LiveCallbacks,
  type LiveConnectParameters,
  type Session,
  type LiveServerMessage,
} from "@google/genai";
import { GeminiLiveClientSDK } from "../lib/gemini/live-client-sdk";

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

async function fixture(
  run: (f: {
    client: GeminiLiveClientSDK;
    calls: LiveConnectParameters[];
    events: string[];
    message: (value: unknown) => void;
    close: () => void;
  }) => Promise<void>,
  overrides: Record<string, unknown> = {},
) {
  const original = Live.prototype.connect;
  const calls: LiveConnectParameters[] = [];
  const events: string[] = [];
  Live.prototype.connect = async (params) => {
    calls.push(params);
    params.callbacks.onopen?.();
    params.callbacks.onmessage({ setupComplete: {} } as LiveServerMessage);
    return {
      close() {},
      sendClientContent() {},
      sendRealtimeInput() {},
    } as unknown as Session;
  };
  const callbacks = (): LiveCallbacks => calls.at(-1)!.callbacks;
  const client = new GeminiLiveClientSDK(
    "auth_tokens/private",
    {
      onReconnecting: () => events.push("reconnecting"),
      onRecovered: () => events.push("recovered"),
      onSetupComplete: () => events.push("setup"),
      onError: () => events.push("error"),
      onDisconnected: () => events.push("disconnected"),
    },
    "backend-model",
    { baseDelayMs: 1 },
    {
      apiVersion: "v1beta",
      resumptionEnabled: true,
      tokenExpiresAt: new Date(Date.now() + 60000).toISOString(),
      sessionDeadlineAt: new Date(Date.now() + 60000).toISOString(),
      // Scheduling delays on busy CI hosts must not consume the recovery budget.
      recoveryBudgetMs: 2000,
      ...overrides,
    },
  );
  try {
    await client.connect();
    await run({
      client,
      calls,
      events,
      message: (value) => callbacks().onmessage(value as never),
      close: () => callbacks().onclose?.({} as CloseEvent),
    });
  } finally {
    client.disconnect();
    Live.prototype.connect = original;
  }
}

test("resumes same credential/model with latest checkpoint and coalesces error/close", async () => {
  await fixture(async ({ calls, events, message, client }) => {
    message({ sessionResumptionUpdate: { resumable: true, newHandle: "old" } });
    message({
      sessionResumptionUpdate: { resumable: true, newHandle: "latest" },
    });
    const oldCallbacks = calls[0].callbacks;
    oldCallbacks.onerror?.({} as ErrorEvent);
    oldCallbacks.onclose?.({} as CloseEvent);
    for (let i = 0; i < 6; i++) await flush();
    assert.equal(calls.length, 2);
    assert.equal(calls[1].model, "backend-model");
    assert.deepEqual(calls[1].config?.sessionResumption, { handle: "latest" });
    assert.deepEqual(events, ["setup", "reconnecting", "recovered"]);
    assert.equal(client.getConnectionState(), "connected");
    oldCallbacks.onclose?.({} as CloseEvent);
    assert.equal(calls.length, 2);
  });
});

test("GoAway rotates on a safe boundary and keeps temporary nonresumable checkpoint", async () => {
  await fixture(async ({ calls, message }) => {
    message({
      sessionResumptionUpdate: { resumable: true, newHandle: "checkpoint" },
    });
    message({ sessionResumptionUpdate: { resumable: false } });
    message({ goAway: { timeLeft: "5s" } });
    assert.equal(calls.length, 1);
    message({
      sessionResumptionUpdate: { resumable: true, newHandle: "safe" },
      serverContent: { turnComplete: true },
    });
    for (let i = 0; i < 6; i++) await flush();
    assert.deepEqual(calls[1].config?.sessionResumption, { handle: "safe" });
  });
});

test("missing checkpoint fails once without starting a fresh conversation", async () => {
  await fixture(async ({ calls, events, close }) => {
    close();
    close();
    await flush();
    assert.equal(calls.length, 1);
    assert.equal(events.filter((event) => event === "error").length, 1);
  });
});

test("expired credential prevents resumption", async () => {
  await fixture(
    async ({ calls, events, message, close }) => {
      message({
        sessionResumptionUpdate: { resumable: true, newHandle: "checkpoint" },
      });
      await new Promise((resolve) => setTimeout(resolve, 5));
      close();
      await flush();
      assert.equal(calls.length, 1);
      assert.ok(events.includes("error"));
    },
    { tokenExpiresAt: new Date(Date.now() + 2).toISOString() },
  );
});

test("recovered transport cannot forward microphone audio before setup acknowledgement", async () => {
  await fixture(async ({ client, calls, message, close, events }) => {
    let acknowledge!: () => void;
    Live.prototype.connect = async (params) => {
      calls.push(params);
      params.callbacks.onopen?.();
      acknowledge = () =>
        params.callbacks.onmessage({ setupComplete: {} } as LiveServerMessage);
      return { close() {}, sendRealtimeInput() {} } as unknown as Session;
    };
    message({
      sessionResumptionUpdate: { resumable: true, newHandle: "checkpoint" },
    });
    close();
    while (!acknowledge) await flush();
    assert.equal(client.sendAudio(new ArrayBuffer(640)), false);
    assert.equal(events.includes("recovered"), false);
    acknowledge();
    await flush();
    assert.equal(client.sendAudio(new ArrayBuffer(640)), true);
  });
});

test("terminal conclusion disables recovery without interrupting report save", async () => {
  await fixture(async ({ client, calls, events, message, close }) => {
    message({
      sessionResumptionUpdate: { resumable: true, newHandle: "checkpoint" },
    });
    client.stopRecovery();
    close();
    await flush();
    assert.equal(calls.length, 1);
    assert.equal(events.includes("error"), false);
  });
});

test("teardown during backoff prevents late recovery", async () => {
  await fixture(async ({ client, calls, events, message, close }) => {
    message({
      sessionResumptionUpdate: { resumable: true, newHandle: "checkpoint" },
    });
    close();
    client.disconnect();
    for (let i = 0; i < 5; i++) await flush();
    assert.equal(calls.length, 1);
    assert.equal(events.includes("recovered"), false);
  });
});
