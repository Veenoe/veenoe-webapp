"use client";

import { Button } from "@/components/ui/button";
import { Mic, MicOff, PhoneOff, Loader2 } from "lucide-react";

interface SessionControlsProps {
    isMuted: boolean;
    isConcluding: boolean;
    isCompleted: boolean;
    onToggleMute: () => void;
    onEndSession: () => void;
}

export function SessionControls({
    isMuted,
    isConcluding,
    isCompleted,
    onToggleMute,
    onEndSession,
}: SessionControlsProps) {
    const isDisabled = isConcluding || isCompleted;

    return (
        <div className="flex items-center gap-6 mt-8">
            <Button
                variant="outline"
                size="icon"
                disabled={isDisabled}
                className={`h-16 w-16 rounded-full border-2 transition-all duration-300 ${isMuted
                        ? "border-destructive text-destructive bg-destructive/10 hover:bg-destructive/20"
                        : "border-primary text-primary hover:bg-primary/10 hover:scale-105"
                    }`}
                onClick={onToggleMute}
            >
                {isMuted ? <MicOff className="h-7 w-7" /> : <Mic className="h-7 w-7" />}
            </Button>

            <Button
                variant="destructive"
                size="lg"
                disabled={isDisabled}
                className="h-16 px-10 rounded-full text-lg font-medium shadow-lg hover:shadow-xl hover:scale-105 transition-all duration-300 bg-red-600 hover:bg-red-700"
                onClick={onEndSession}
            >
                {isConcluding ? (
                    <>
                        <Loader2 className="mr-3 h-6 w-6 animate-spin" />
                        Concluding...
                    </>
                ) : (
                    <>
                        <PhoneOff className="mr-3 h-6 w-6" />
                        End Session
                    </>
                )}
            </Button>
        </div>
    );
}
