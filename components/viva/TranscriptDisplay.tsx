"use client";

import { AudioState } from "@/types/viva";

interface TranscriptDisplayProps {
    isConcluding: boolean;
    lastMessage: string | undefined;
    audioState: AudioState;
}

export function TranscriptDisplay({
    isConcluding,
    lastMessage,
    audioState,
}: TranscriptDisplayProps) {
    return (
        <div className="w-full max-w-2xl text-center space-y-4 min-h-[100px] flex flex-col justify-center px-6 py-4 rounded-2xl bg-white/5 backdrop-blur-sm border border-white/10">
            {isConcluding ? (
                <p className="text-xl font-medium text-pumpkin animate-pulse">
                    Evaluating your performance...
                </p>
            ) : lastMessage ? (
                <p className="text-xl md:text-2xl font-light text-foreground leading-relaxed">
                    "{lastMessage}"
                </p>
            ) : (
                <p className="text-lg text-muted-foreground animate-pulse font-light">
                    {audioState === AudioState.RECORDING ? "Listening..." : "Connecting..."}
                </p>
            )}
        </div>
    );
}
