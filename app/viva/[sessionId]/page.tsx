// veenoe-webapp/app/viva/[sessionId]/page.tsx
"use client";

import React, { useEffect } from "react";
import { useParams as NextParams } from "next/navigation";
import { useVivaStore } from "@/lib/store/viva-store";
import { AudioPlayer } from "@/components/viva/AudioPlayer";
import { Loader2, Mic } from "lucide-react";

const useParams = (React as any).useParams || NextParams;

export default function VivaSessionPage() {
  const params = useParams();
  const sessionId = Array.isArray(params.sessionId)
    ? params.sessionId[0]
    : params.sessionId;

  const connectToViva = useVivaStore((s) => s.connectToViva);
  const disconnect = useVivaStore((s) => s.disconnect);
  const initializeMicrophone = useVivaStore((s) => s.initializeMicrophone);  // Warms only now
  const vivaState = useVivaStore((s) => s.vivaState);
  const error = useVivaStore((s) => s.error);

  useEffect(() => {
    if (sessionId) {
      console.log(`PAGE: Loading session ${sessionId}, warming mic and connecting WS.`);
      initializeMicrophone().then(() => {  // CHANGED: Warms, no auto-listen
        console.log("PAGE: Mic warmed.");
      }).catch(err => console.error("PAGE: Mic warm failed:", err));
      connectToViva(sessionId);
    }
    return () => disconnect();
  }, [sessionId, initializeMicrophone, connectToViva, disconnect]);

  const renderStatus = () => {
    switch (vivaState) {
      case "connecting":
        return (
          <>
            <Loader2 className="mr-2 h-6 w-6 animate-spin" />
            Connecting to session...
          </>
        );
      case "speaking":
        return (
          <span className="text-pumpkin-500">
            AI is speaking, listen carefully...
          </span>
        );
      case "listening":
        return (
          <span className="text-green-500 flex items-center">
            <Mic className="mr-2 h-6 w-6 animate-pulse" />
            Listening... It's your turn.
          </span>
        );
      case "connected":
        return (
          <span className="text-muted-foreground">
            Session ready - waiting for AI to start...
          </span>  // CHANGED: Clearer for init
        );
      case "error":
        return <span className="text-destructive">Error: {error}</span>;
      default:
        return <span className="capitalize">{vivaState}</span>;
    }
  };

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-12">
      <AudioPlayer />

      <div className="container max-w-2xl text-center">
        <h1 className="text-4xl font-light tracking-tight">
          Viva Session Active
        </h1>
        <p className="mt-4 text-lg text-muted-foreground">
          Session ID: {sessionId}
        </p>
        <div className="mt-4 text-2xl font-medium flex items-center justify-center min-h-[32px]">
          {renderStatus()}
        </div>
      </div>
    </main>
  );
}