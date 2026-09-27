import assert from "node:assert/strict";
import test from "node:test";
import { applyAbandonOutcome } from "../lib/hooks/viva/session-lifecycle";
import { SessionState } from "../types/viva";

for (const [status, expectedState, expectedPath] of [
  ["abandoned", SessionState.IDLE, "/"],
  ["completed", SessionState.COMPLETED, "/v/session-one"],
] as const) {
  test(`abandon response ${status} follows the authoritative session status`, () => {
    const effects: string[] = [];
    applyAbandonOutcome({ status }, "session-one", {
      setSessionState: (state) => effects.push(`state:${state}`),
      cleanupResources: () => effects.push("cleanup"),
      navigate: (path) => effects.push(`navigate:${path}`),
    });
    assert.deepEqual(effects, [
      `state:${expectedState}`,
      "cleanup",
      `navigate:${expectedPath}`,
    ]);
  });
}
