"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { useUser } from "@clerk/nextjs";
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
  const queryClient = useQueryClient();
  const { user } = useUser();
  const {
    microphoneState,
    conversationState,
    playbackState,
    isMuted,
    toggleMute,
    transcripts,
    requestConclusion,
    sessionState,
    conclusionData,
    sessionId,
    error,
    connectionNotice,
  } = vivaSession;

  const [dismissedResultSessionId, setDismissedResultSessionId] = useState<
    string | null
  >(null);
  const isConcluding = sessionState === SessionState.CONCLUDING;
  const isCompleted = sessionState === SessionState.COMPLETED;

  // Automatically open the dialog when session is completed
  // Also refresh the sidebar history so new session appears
  useEffect(() => {
    if (isCompleted) {
      // Invalidate history query so sidebar updates with new session
      if (user?.id) {
        queryClient.invalidateQueries({ queryKey: ["history", user.id] });
      }
    }
  }, [isCompleted, queryClient, user?.id]);

  const handleViewReport = () => {
    if (sessionId) {
      router.push(`/v/${sessionId}`);
    }
  };

  return (
    <>
      <div className="flex flex-col items-center justify-center min-h-[80vh] space-y-8 max-w-4xl mx-auto w-full animate-in fade-in duration-500">
        {/* Timer */}
        <div className="w-full flex justify-center">
          <SessionTimer onTimeLimit={requestConclusion} />
        </div>

        {/* Visualizer */}
        <Card className="w-full border-none shadow-none bg-transparent">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <VoiceVisualizer
              isConnecting={sessionState === SessionState.STARTING}
              microphoneState={microphoneState}
              playbackState={playbackState}
              isMuted={isMuted}
            />
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
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        {connectionNotice && !error && !isCompleted && (
          <p role="status" className="text-sm text-muted-foreground">
            {connectionNotice}
          </p>
        )}

        {/* Transcript / Status */}
        <TranscriptDisplay
          isConnecting={sessionState === SessionState.STARTING}
          isConcluding={isConcluding}
          transcripts={transcripts}
          conversationState={conversationState}
          playbackState={playbackState}
        />
      </div>

      {/* Completion Dialog */}
      <CompletionDialog
        open={isCompleted && dismissedResultSessionId !== sessionId}
        onOpenChange={(open) => {
          if (!open) setDismissedResultSessionId(sessionId);
        }}
        score={conclusionData?.score ?? 0}
        onViewReport={handleViewReport}
      />
    </>
  );
}
