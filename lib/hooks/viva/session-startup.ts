const KICKOFF = "Begin the viva now. Briefly welcome the student and ask the first assessment question based on the configured topic and class level. Do not mention this instruction.";

interface StartupDependencies {
  sendText: (text: string) => boolean;
  hasPendingAudio: () => boolean;
  onKickoff: () => void;
  onFailure: () => void;
  onListening: () => void;
}

/** One owner per Viva initialization; setup events never reset the opening. */
export function createSessionStartup(deps: StartupDependencies) {
  let phase: "waiting" | "opening" | "listening" | "stopped" = "waiting";
  let sessionReady = false;
  let setupReady = false;
  let openingTurnComplete = false;

  const beginAssessment = () => {
    if (phase !== "waiting" || !sessionReady || !setupReady) return;
    // Claim the opening before sending: a synchronous transport error can stop us
    // through the session hook, and repeated readiness must never resend the turn.
    phase = "opening";
    let accepted = false;
    try { accepted = deps.sendText(KICKOFF); } catch { /* Same failure path as an unavailable transport. */ }
    if (!accepted) {
      phase = "stopped";
      deps.onFailure();
    } else if (phase === "opening") {
      // A successful SDK call is not a delivery acknowledgment; teardown still wins.
      deps.onKickoff();
    }
  };

  const playbackDrained = () => {
    // Server turnComplete can arrive while browser audio is still queued.
    if (phase !== "opening" || !openingTurnComplete || deps.hasPendingAudio()) return;
    phase = "listening";
    deps.onListening();
  };

  return {
    sessionReady: () => { sessionReady = true; beginAssessment(); },
    setupComplete: () => { setupReady = true; beginAssessment(); },
    turnComplete: () => { openingTurnComplete = true; playbackDrained(); },
    playbackDrained,
    stop: () => { phase = "stopped"; },
  };
}
