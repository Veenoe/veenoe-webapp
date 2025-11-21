/**
 * Custom React Hook for Session Timer
 * Manages the 10-minute countdown timer with warnings
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
export function useSessionTimer() {
    const {
        timeRemaining,
        sessionState,
        timerWarningShown,
        setTimeRemaining,
        setTimerWarning,
        setSessionState,
    } = useVivaStore();

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
        []
    );

    /**
     * Calculate progress percentage
     */
    const getProgress = useCallback(
        (seconds: number, totalMinutes: number): number => {
            const totalSeconds = totalMinutes * 60;
            return (seconds / totalSeconds) * 100;
        },
        []
    );

    // Timer countdown effect
    useEffect(() => {
        if (sessionState !== SessionState.ACTIVE) {
            return;
        }

        const interval = setInterval(() => {
            setTimeRemaining(Math.max(0, timeRemaining - 1));

            // Show warning at 2 minutes
            if (timeRemaining === WARNING_THRESHOLD && !timerWarningShown) {
                setTimerWarning(true);
                // You can trigger a toast notification here
            }

            // Auto-conclude at 0
            if (timeRemaining <= 0) {
                setSessionState(SessionState.CONCLUDING);
                clearInterval(interval);
            }
        }, 1000);

        return () => clearInterval(interval);
    }, [
        sessionState,
        timeRemaining,
        timerWarningShown,
        setTimeRemaining,
        setTimerWarning,
        setSessionState,
    ]);

    return {
        timeRemaining,
        formattedTime: formatTime(timeRemaining),
        timerStatus: getTimerStatus(timeRemaining),
        progress: getProgress(timeRemaining, 10),
        isWarning: timeRemaining <= WARNING_THRESHOLD,
        isUrgent: timeRemaining <= URGENT_THRESHOLD,
    };
}
