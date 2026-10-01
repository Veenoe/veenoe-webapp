"use client";

import { ConversationState, PlaybackState } from "@/types/viva";

interface TranscriptDisplayProps {
    isConnecting: boolean;
    isConcluding: boolean;
    lastMessage: string | undefined;
    conversationState: ConversationState;
    playbackState: PlaybackState;
}

export function TranscriptDisplay({
    isConnecting,
    isConcluding,
    lastMessage,
    conversationState,
    playbackState,
}: TranscriptDisplayProps) {
    return (
        <div className="w-full max-w-2xl text-center space-y-4 min-h-[100px] flex flex-col justify-center px-6 py-4 rounded-2xl bg-white/5 backdrop-blur-sm border border-white/10">
            {isConnecting ? (
                <p className="text-lg text-muted-foreground animate-pulse font-light">
                    Connecting...
                </p>
            ) : isConcluding ? (
                <p className="text-xl font-medium text-pumpkin animate-pulse">
                    Evaluating your performance...
                </p>
            ) : lastMessage ? (
                <p className="text-xl md:text-2xl font-light text-foreground leading-relaxed">
                    "{lastMessage}"
                </p>
            ) : (
                <p className="text-lg text-muted-foreground animate-pulse font-light">
                    {playbackState === PlaybackState.PLAYING
                        ? "Veenoe is speaking..."
                        : conversationState === ConversationState.LISTENING
                            ? "Listening..."
                            : conversationState === ConversationState.THINKING
                                ? "Thinking..."
                                : "Connecting..."}
                </p>
            )}
        </div>
    );
}
