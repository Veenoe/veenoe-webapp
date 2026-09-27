import type { AbandonVivaResponse } from "@/lib/api/axios";
import { SessionState } from "@/types/viva";

interface AbandonOutcomeActions {
  setSessionState: (state: SessionState) => void;
  cleanupResources: () => void;
  navigate: (path: string) => void;
}

export function applyAbandonOutcome(
  response: AbandonVivaResponse,
  sessionId: string,
  actions: AbandonOutcomeActions,
): void {
  if (response.status === "abandoned") {
    actions.setSessionState(SessionState.IDLE);
    actions.cleanupResources();
    actions.navigate("/");
    return;
  }

  if (response.status === "completed") {
    actions.setSessionState(SessionState.COMPLETED);
    actions.cleanupResources();
    actions.navigate(`/v/${sessionId}`);
    return;
  }

  throw new Error("Unexpected session status from abandonment endpoint");
}
