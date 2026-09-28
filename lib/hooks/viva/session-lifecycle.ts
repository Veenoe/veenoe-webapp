import type { AbandonVivaResponse } from "@/lib/api/axios";
import { SessionState } from "@/types/viva";
import type { MicrophoneError, MicrophoneErrorCode } from "@/lib/gemini/audio-recorder";

interface FatalMicrophoneActions {
  recordError: (code: MicrophoneErrorCode) => void;
  setError: (message: string) => void;
  setSessionState: (state: SessionState) => void;
  cleanupResources: () => void;
  abandonSession: () => Promise<void>;
}

/** A lost microphone makes the local realtime session unusable even if persistence fails. */
export function endSessionForMicrophoneFailure(
  error: MicrophoneError,
  handled: { current: boolean },
  actions: FatalMicrophoneActions,
): void {
  if (handled.current) return;
  handled.current = true;
  actions.recordError(error.code);
  actions.setError(error.message);
  actions.setSessionState(SessionState.ERROR);
  actions.cleanupResources();
  void actions.abandonSession().catch(() => {});
}

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
