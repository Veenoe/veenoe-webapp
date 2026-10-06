import type { GeminiLiveEventHandlers } from "../../gemini/live-client-sdk";
import type { createSessionStartup } from "./session-startup";
import { useVivaStore } from "../../store/viva-store";
import { voiceTelemetry } from "../../telemetry/voice-telemetry";
import { SessionState } from "../../../types/viva";

interface RecoveryHandlerDependencies {
  isCurrent: () => boolean;
  isConclusionSaving: () => boolean;
  pendingConclusion: { current: boolean };
  stopPlayback: () => void;
  closeTranscripts: () => void;
  startup: () => ReturnType<typeof createSessionStartup>;
  sendConclusion: () => boolean;
}

/** Adapt transport recovery to the current viva UI without taking ownership of retries. */
export function createLiveRecoveryHandlers(
  deps: RecoveryHandlerDependencies,
): Pick<GeminiLiveEventHandlers, "onReconnecting" | "onRecovered"> {
  return {
    /** Discard retired playback while preserving transcript history and pending end requests. */
    onReconnecting: (reason) => {
      if (!deps.isCurrent()) return;
      const state = useVivaStore.getState();
      if (
        state.sessionState === SessionState.CONCLUDING &&
        !deps.isConclusionSaving() &&
        !state.conclusionData
      )
        deps.pendingConclusion.current = true;
      voiceTelemetry.onLiveRecovery("started", reason);
      useVivaStore.setState({
        connectionStatus: "reconnecting",
        connectionNotice: "Reconnecting…",
      });
      deps.stopPlayback();
      deps.closeTranscripts();
    },
    /** Restore readiness once; a failed conclusion send retains its request for the next recovery. */
    onRecovered: (reason, elapsedMs) => {
      if (!deps.isCurrent()) return;
      voiceTelemetry.onLiveRecovery("restored", reason, elapsedMs);
      useVivaStore.setState({
        connectionStatus: "connected",
        connectionNotice:
          "Connection restored. Please repeat your last answer if needed.",
      });
      // The existing startup owner retains its phase and never repeats kickoff.
      const startup = deps.startup();
      startup.sessionReady();
      startup.setupComplete();
      startup.connectionRestored();
      if (deps.pendingConclusion.current && deps.sendConclusion()) {
        deps.pendingConclusion.current = false;
        useVivaStore.getState().setSessionState(SessionState.CONCLUDING);
      }
    },
  };
}
