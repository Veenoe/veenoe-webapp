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
    const { formattedTime, isWarning, isUrgent } = useSessionTimer();

    return (
        <div className="flex flex-col items-center justify-center p-4">
            <div
                className={cn(
                    "text-4xl font-mono font-bold tracking-wider transition-colors duration-300",
                    isUrgent ? "text-destructive animate-pulse" :
                        isWarning ? "text-pumpkin" : "text-foreground"
                )}
            >
                {formattedTime}
            </div>
            {isWarning && (
                <p className={cn(
                    "text-xs mt-2 font-medium",
                    isUrgent ? "text-destructive" : "text-pumpkin"
                )}>
                    {isUrgent ? "Ending soon!" : "Time running out"}
                </p>
            )}
        </div>
    );
}
