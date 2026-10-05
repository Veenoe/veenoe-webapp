import assert from "node:assert/strict";
import test from "node:test";
import { LiveRecovery } from "../lib/gemini/live-recovery";

function recovery(
  connect: (handle: string, deadline: number) => Promise<void>,
  options = {},
) {
  const events: string[] = [];
  const owner = new LiveRecovery(
    {
      resumptionEnabled: true,
      tokenExpiresAt: new Date(Date.now() + 60000).toISOString(),
      sessionDeadlineAt: new Date(Date.now() + 60000).toISOString(),
      ...options,
    },
    {
      connect,
      onReconnecting: () => events.push("started"),
      onAttempt: (attempt) => events.push(`attempt-${attempt}`),
      onRecovered: () => events.push("restored"),
      onFailure: () => events.push("failed"),
    },
    0,
  );
  owner.update(true, "private-checkpoint");
  return { owner, events };
}

test("provider failures exhaust exactly three attempts and cannot restart recovery", async () => {
  let calls = 0;
  const { owner, events } = recovery(async () => {
    calls++;
    throw new Error("provider failure");
  });
  await owner.recover("transport");
  await owner.recover("transport");
  assert.equal(calls, 3);
  assert.deepEqual(events, [
    "started",
    "attempt-1",
    "attempt-2",
    "attempt-3",
    "failed",
  ]);
});

test("recovery deadline is capped by session and credential expiry", async () => {
  const now = Date.now();
  let deadline = 0;
  const { owner } = recovery(
    async (_, value) => {
      deadline = value;
    },
    {
      tokenExpiresAt: new Date(now + 30000).toISOString(),
      sessionDeadlineAt: new Date(now + 10000).toISOString(),
    },
  );
  await owner.recover("transport");
  assert.equal(deadline, now + 10000);
  owner.stop();
});

test("the twenty-second budget expires without another connection attempt", async () => {
  let calls = 0;
  const { owner, events } = recovery(
    async () => {
      calls++;
    },
    { recoveryBudgetMs: 0 },
  );
  await owner.recover("transport");
  assert.equal(calls, 0);
  assert.deepEqual(events, ["failed"]);
});

test("disconnect during an in-flight attempt suppresses recovery completion", async () => {
  let finish!: () => void;
  const { owner, events } = recovery(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
  );
  const pending = owner.recover("transport");
  while (!finish) await new Promise((resolve) => setImmediate(resolve));
  owner.stop();
  finish();
  await pending;
  assert.deepEqual(events, ["started", "attempt-1"]);
});

test("GoAway without a checkpoint fails at its deadline and clears rotation", async () => {
  let failures = 0;
  const owner = new LiveRecovery(
    {},
    {
      connect: async () => assert.fail("No checkpoint"),
      onReconnecting() {},
      onAttempt() {},
      onRecovered() {},
      onFailure: () => {
        failures++;
      },
    },
    0,
  );
  owner.goAway("0s");
  await new Promise((resolve) => setTimeout(resolve, 5));
  owner.goAway("0s");
  assert.equal(failures, 1);
});
