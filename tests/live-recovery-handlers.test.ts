import assert from "node:assert/strict";
import test from "node:test";
import { createLiveRecoveryHandlers } from "../lib/hooks/viva/live-recovery-handlers";
import { createSessionStartup } from "../lib/hooks/viva/session-startup";
import { useVivaStore } from "../lib/store/viva-store";
import { SessionState } from "../types/viva";

test("recovery callbacks release opening playback and retain an end request until accepted", () => {
  useVivaStore.getState().resetSession();
  useVivaStore.setState({ sessionState: SessionState.CONCLUDING });
  let pendingAudio = true;
  let listening = 0;
  let kickoffs = 0;
  let transcriptsClosed = 0;
  let acceptConclusion = false;
  const pendingConclusion = { current: false };
  const startup = createSessionStartup({
    sendText: () => {
      kickoffs++;
      return true;
    },
    hasPendingAudio: () => pendingAudio,
    onKickoff: () => {},
    onFailure: () => assert.fail("unexpected startup failure"),
    onListening: () => {
      listening++;
    },
  });
  startup.sessionReady();
  startup.setupComplete();
  startup.turnComplete();
  const handlers = createLiveRecoveryHandlers({
    isCurrent: () => true,
    isConclusionSaving: () => false,
    pendingConclusion,
    stopPlayback: () => {
      pendingAudio = false;
    },
    closeTranscripts: () => {
      transcriptsClosed++;
    },
    startup: () => startup,
    sendConclusion: () => acceptConclusion,
  });
  handlers.onReconnecting!("transport");
  assert.equal(useVivaStore.getState().connectionStatus, "reconnecting");
  assert.equal(pendingConclusion.current, true);
  handlers.onRecovered!("transport", 10);
  assert.equal(pendingConclusion.current, true);
  assert.equal(listening, 1);
  acceptConclusion = true;
  handlers.onRecovered!("transport", 10);
  assert.equal(pendingConclusion.current, false);
  assert.equal(kickoffs, 1);
  assert.equal(listening, 1);
  assert.equal(transcriptsClosed, 1);
  assert.equal(useVivaStore.getState().sessionState, SessionState.CONCLUDING);
  useVivaStore.getState().resetSession();
});

test("retired viva callbacks cannot mutate the next session or its resources", () => {
  useVivaStore.getState().resetSession();
  const unexpected = () => assert.fail("retired callback acquired a resource");
  const handlers = createLiveRecoveryHandlers({
    isCurrent: () => false,
    isConclusionSaving: unexpected,
    pendingConclusion: { current: false },
    stopPlayback: unexpected,
    closeTranscripts: unexpected,
    startup: unexpected,
    sendConclusion: unexpected,
  });
  const before = useVivaStore.getState();
  handlers.onReconnecting!("transport");
  handlers.onRecovered!("transport", 10);
  assert.equal(useVivaStore.getState(), before);
});
