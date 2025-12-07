"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { SessionTimer } from "./SessionTimer";
import { VoiceVisualizer } from "./VoiceVisualizer";
import { SessionControls } from "./SessionControls";
import { TranscriptDisplay } from "./TranscriptDisplay";
import { CompletionDialog } from "./CompletionDialog";
import { Card, CardContent } from "@/components/ui/card";
import { useVivaSession } from "@/lib/hooks/useVivaSession";
import { SessionState } from "@/types/viva";

interface VivaActiveSessionProps {
    vivaSession: ReturnType<typeof useVivaSession>;
}

export function VivaActiveSession({ vivaSession }: VivaActiveSessionProps) {
    const router = useRouter();
    const {
        audioState,
        isMuted,
        toggleMute,
        transcripts,
        requestConclusion,
        sessionState,
        conclusionData,
        sessionId,
    } = vivaSession;

    const [isResultOpen, setIsResultOpen] = useState(false);
    const isConcluding = sessionState === SessionState.CONCLUDING;
    const isCompleted = sessionState === SessionState.COMPLETED;

    // Automatically open the dialog when session is completed
    useEffect(() => {
        if (isCompleted) {
            setIsResultOpen(true);
        }
    }, [isCompleted]);

    const handleViewReport = () => {
        if (sessionId) {
            router.push(`/v/${sessionId}`);
        }
    };

    // Get the last assistant message to display
    const lastAssistantMessage = transcripts
        .filter((t) => t.role === "assistant")
        .slice(-1)[0]?.text;

    return (
        <>
            <div className="flex flex-col items-center justify-center min-h-[80vh] space-y-8 max-w-4xl mx-auto w-full animate-in fade-in duration-500">
                {/* Timer */}
                <div className="w-full flex justify-center">
                    <SessionTimer />
                </div>

                {/* Visualizer */}
                <Card className="w-full border-none shadow-none bg-transparent">
                    <CardContent className="flex flex-col items-center justify-center py-12">
                        <VoiceVisualizer audioState={audioState} isMuted={isMuted} />
                    </CardContent>
                </Card>

                {/* Controls */}
                <SessionControls
                    isMuted={isMuted}
                    isConcluding={isConcluding}
                    isCompleted={isCompleted}
                    onToggleMute={toggleMute}
                    onEndSession={requestConclusion}
                />

                {/* Transcript / Status */}
                <TranscriptDisplay
                    isConcluding={isConcluding}
                    lastMessage={lastAssistantMessage}
                    audioState={audioState}
                />
            </div>

            {/* Completion Dialog */}
            <CompletionDialog
                open={isResultOpen}
                onOpenChange={setIsResultOpen}
                score={conclusionData?.score ?? 0}
                onViewReport={handleViewReport}
            />
        </>
    );
}