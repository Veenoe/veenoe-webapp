"use client";

import { ConversationState, PlaybackState } from "@/types/viva";
import { useEffect, useRef } from "react";
import { AudioLines, LoaderCircle, MessageSquareText, UserRound } from "lucide-react";
import type { Transcript } from "@/lib/store/viva-store";
import { cn } from "@/lib/utils";

interface TranscriptDisplayProps {
    isConnecting: boolean;
    isConcluding: boolean;
    transcripts: readonly Transcript[];
    conversationState: ConversationState;
    playbackState: PlaybackState;
}

export function TranscriptDisplay({
    isConnecting,
    isConcluding,
    transcripts,
    conversationState,
    playbackState,
}: TranscriptDisplayProps) {
    const viewportRef = useRef<HTMLDivElement>(null);
    const followLatestRef = useRef(true);
    const visibleTranscripts = transcripts.filter((entry) => entry.text.trim());
    const statusText = isConnecting
        ? "Connecting..."
        : isConcluding
            ? "Evaluating your performance..."
            : playbackState === PlaybackState.PLAYING
                ? "Veenoe is speaking..."
                : conversationState === ConversationState.LISTENING
                    ? "Listening..."
                    : conversationState === ConversationState.THINKING
                        ? "Thinking..."
                        : "Connecting...";
    const isProcessing = isConnecting || isConcluding || (
        playbackState !== PlaybackState.PLAYING && conversationState === ConversationState.THINKING
    );

    useEffect(() => {
        if (transcripts.length === 0) followLatestRef.current = true;
        const viewport = viewportRef.current;
        if (viewport && followLatestRef.current) {
            viewport.scrollTop = viewport.scrollHeight;
        }
    }, [transcripts]);

    return (
        <section className="w-full min-w-0 max-w-2xl overflow-hidden rounded-2xl border border-border bg-card text-card-foreground shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-border px-4 py-3 sm:px-5">
                <div className="flex items-center gap-2">
                    <MessageSquareText aria-hidden="true" className="size-4 text-muted-foreground" />
                    <h2 className="text-sm font-semibold">Conversation</h2>
                </div>
                <div role="status" aria-atomic="true" className="flex min-w-0 items-center gap-2 text-xs font-medium text-muted-foreground">
                    {isProcessing ? (
                        <LoaderCircle aria-hidden="true" className="size-3.5 shrink-0 motion-safe:animate-spin" />
                    ) : (
                        <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full bg-current" />
                    )}
                    <span>{statusText}</span>
                </div>
            </div>
            {visibleTranscripts.length > 0 && (
                <div
                    ref={viewportRef}
                    role="region"
                    aria-label="Live transcript"
                    tabIndex={0}
                    className="max-h-72 overflow-y-auto overscroll-contain px-4 py-5 text-left [overflow-anchor:none] [scrollbar-gutter:stable] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary sm:max-h-80 sm:px-5"
                    onScroll={(event) => {
                        const viewport = event.currentTarget;
                        followLatestRef.current = viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight < 32;
                    }}
                >
                    <ol className="space-y-5">
                        {visibleTranscripts.map((entry) => (
                            <li key={entry.id} className={cn("flex", entry.role === "user" ? "justify-end" : "justify-start")}>
                                <div className="min-w-0 max-w-[90%] space-y-1.5 sm:max-w-[85%]">
                                    <div className={cn("flex items-center gap-1.5 text-xs font-medium text-muted-foreground", entry.role === "user" && "justify-end")}>
                                        {entry.role === "user" ? (
                                            <UserRound aria-hidden="true" className="size-3.5 shrink-0" />
                                        ) : (
                                            <AudioLines aria-hidden="true" className="size-3.5 shrink-0" />
                                        )}
                                        <span>{entry.role === "user" ? "You" : "Veenoe"}</span>
                                    </div>
                                    <p className={cn(
                                        "rounded-2xl border px-4 py-3 text-base leading-7 whitespace-pre-wrap [overflow-wrap:anywhere]",
                                        entry.role === "user"
                                            ? "rounded-tr-md border-pumpkin/20 bg-pumpkin/10 text-card-foreground"
                                            : "rounded-tl-md border-border bg-muted/50 text-card-foreground",
                                    )}>
                                        {entry.text}
                                    </p>
                                </div>
                            </li>
                        ))}
                    </ol>
                </div>
            )}
            {visibleTranscripts.length === 0 && (
                <div className="flex min-h-44 flex-col items-center justify-center gap-3 px-6 py-8 text-center">
                    <div className="flex size-10 items-center justify-center rounded-xl border border-border bg-muted/50">
                        <MessageSquareText aria-hidden="true" className="size-5 text-muted-foreground" />
                    </div>
                    <p className="text-sm leading-6 text-muted-foreground">
                        Your conversation will appear here.
                    </p>
                </div>
            )}
        </section>
    );
}
