/**
 * Custom React Hook for Session Timer
 * Manages the session countdown and requests the normal conclusion at expiry.
 */

"use client";

import { useEffect, useCallback } from "react";
import { useVivaStore } from "@/lib/store/viva-store";
import { SessionState } from "@/types/viva";

/**
 * Timer configuration
 */
const WARNING_THRESHOLD = 120; // 2 minutes in seconds
const URGENT_THRESHOLD = 60; // 1 minute in seconds

/**
 * Hook for managing the session timer
 */
export function useSessionTimer(onTimeLimit: () => void) {
  const { timeRemaining, sessionState, sessionDurationMinutes } =
    useVivaStore();

  /**
   * Format time remaining as MM:SS
   */
  const formatTime = useCallback((seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  }, []);

  /**
   * Get timer status for UI styling
   */
  const getTimerStatus = useCallback(
    (seconds: number): "normal" | "warning" | "urgent" => {
      if (seconds <= URGENT_THRESHOLD) return "urgent";
      if (seconds <= WARNING_THRESHOLD) return "warning";
      return "normal";
    },
    [],
  );

  /**
   * Calculate progress percentage
   */
  const getProgress = useCallback(
    (seconds: number, totalMinutes: number): number => {
      const totalSeconds = totalMinutes * 60;
      return (seconds / totalSeconds) * 100;
    },
    [],
  );

  // Timer countdown effect
  useEffect(() => {
    if (sessionState !== SessionState.ACTIVE) {
      return;
    }

    const interval = setInterval(() => {
      advanceSessionTimer(onTimeLimit);
    }, 1000);

    return () => clearInterval(interval);
  }, [sessionState, onTimeLimit]);

  return {
    timeRemaining,
    formattedTime: formatTime(timeRemaining),
    timerStatus: getTimerStatus(timeRemaining),
    progress: getProgress(timeRemaining, sessionDurationMinutes),
    isWarning: timeRemaining <= WARNING_THRESHOLD,
    isUrgent: timeRemaining <= URGENT_THRESHOLD,
  };
}

/** Read current state so an expired timer cannot race a completed/paused session. */
export function advanceSessionTimer(onTimeLimit: () => void): void {
  const state = useVivaStore.getState();
  if (state.sessionState !== SessionState.ACTIVE) return;
  const remaining = state.sessionDeadlineAt
    ? Math.max(
        0,
        Math.ceil((Date.parse(state.sessionDeadlineAt) - Date.now()) / 1000),
      )
    : Math.max(0, state.timeRemaining - 1);
  state.setTimeRemaining(remaining);
  if (remaining <= WARNING_THRESHOLD && !state.timerWarningShown)
    state.setTimerWarning(true);
  if (remaining === 0) onTimeLimit();
}
