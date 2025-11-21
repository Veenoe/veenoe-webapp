/**
 * Session Timer Component
 * Displays countdown timer with visual warnings
 */

"use client";

import { useSessionTimer } from "@/lib/hooks/useSessionTimer";
import { Progress } from "@/components/ui/progress";
import { Clock, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Session timer component with countdown and progress bar
 */
export function SessionTimer() {
    const { formattedTime, progress, timerStatus, isWarning, isUrgent } =
        useSessionTimer();

    return (
        <div className="space-y-2">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <Clock
                        className={cn(
                            "h-4 w-4",
                            isUrgent && "text-destructive animate-pulse",
                            isWarning && !isUrgent && "text-pumpkin",
                            !isWarning && "text-muted-foreground"
                        )}
                    />
                    <span className="text-sm font-medium text-muted-foreground">
                        Time Remaining
                    </span>
                </div>
                <div className="flex items-center gap-2">
                    {isWarning && (
                        <AlertTriangle
                            className={cn(
                                "h-4 w-4",
                                isUrgent ? "text-destructive" : "text-pumpkin"
                            )}
                        />
                    )}
                    <span
                        className={cn(
                            "text-lg font-mono font-bold",
                            isUrgent && "text-destructive animate-pulse",
                            isWarning && !isUrgent && "text-pumpkin",
                            !isWarning && "text-foreground"
                        )}
                    >
                        {formattedTime}
                    </span>
                </div>
            </div>

            <Progress
                value={progress}
                className={cn(
                    "h-2",
                    isUrgent && "[&>div]:bg-destructive",
                    isWarning && !isUrgent && "[&>div]:bg-pumpkin",
                    !isWarning && "[&>div]:bg-primary"
                )}
            />

            {isWarning && (
                <p
                    className={cn(
                        "text-xs text-center",
                        isUrgent ? "text-destructive font-medium" : "text-pumpkin"
                    )}
                >
                    {isUrgent
                        ? "⚠️ Less than 1 minute remaining!"
                        : "⏰ Less than 2 minutes remaining"}
                </p>
            )}
        </div>
    );
}
