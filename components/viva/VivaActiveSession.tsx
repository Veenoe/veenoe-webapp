"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { SessionTimer } from "./SessionTimer";
import { VoiceVisualizer } from "./VoiceVisualizer";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter
} from "@/components/ui/dialog";
import { Mic, MicOff, PhoneOff, Loader2, Trophy, ArrowRight } from "lucide-react";
import { useVivaSession } from "@/lib/hooks/useVivaSession";
import { AudioState, SessionState } from "@/types/viva";

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
        conclusionData, // Now available via store update
        sessionId
    } = vivaSession;

    const [isResultOpen, setIsResultOpen] = useState(false);
    const isConcluding = sessionState === SessionState.CONCLUDING;

    // Automatically open the dialog when session is completed
    useEffect(() => {
        if (sessionState === SessionState.COMPLETED) {
            setIsResultOpen(true);
        }
    }, [sessionState]);

    const handleViewReport = () => {
        if (sessionId) {
            router.push(`/v/${sessionId}`);
        }
    };

    // Get the last assistant message to display
    const lastAssistantMessage = transcripts
        .filter(t => t.role === "assistant")
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
                <div className="flex items-center gap-6 mt-8">
                    <Button
                        variant="outline"
                        size="icon"
                        disabled={isConcluding || sessionState === SessionState.COMPLETED}
                        className={`h-16 w-16 rounded-full border-2 transition-all duration-300 ${
                            isMuted 
                            ? "border-destructive text-destructive bg-destructive/10 hover:bg-destructive/20" 
                            : "border-primary text-primary hover:bg-primary/10 hover:scale-105"
                        }`}
                        onClick={toggleMute}
                    >
                        {isMuted ? <MicOff className="h-7 w-7" /> : <Mic className="h-7 w-7" />}
                    </Button>

                    <Button
                        variant="destructive"
                        size="lg"
                        disabled={isConcluding || sessionState === SessionState.COMPLETED}
                        className="h-16 px-10 rounded-full text-lg font-medium shadow-lg hover:shadow-xl hover:scale-105 transition-all duration-300 bg-red-600 hover:bg-red-700"
                        onClick={requestConclusion}
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

                {/* Transcript / Status */}
                <div className="w-full max-w-2xl text-center space-y-4 min-h-[100px] flex flex-col justify-center px-6 py-4 rounded-2xl bg-white/5 backdrop-blur-sm border border-white/10">
                    {isConcluding ? (
                        <p className="text-xl font-medium text-pumpkin animate-pulse">
                            Evaluating your performance...
                        </p>
                    ) : lastAssistantMessage ? (
                        <p className="text-xl md:text-2xl font-light text-foreground leading-relaxed">
                            "{lastAssistantMessage}"
                        </p>
                    ) : (
                        <p className="text-lg text-muted-foreground animate-pulse font-light">
                            {audioState === AudioState.RECORDING ? "Listening..." : "Connecting..."}
                        </p>
                    )}
                </div>
            </div>

            {/* Completion Dialog */}
            <Dialog open={isResultOpen} onOpenChange={setIsResultOpen}>
                <DialogContent className="sm:max-w-md text-center">
                    <DialogHeader>
                        <div className="mx-auto bg-green-100 p-3 rounded-full w-fit mb-4">
                            <Trophy className="h-8 w-8 text-green-600" />
                        </div>
                        <DialogTitle className="text-2xl text-center">Viva Concluded!</DialogTitle>
                        <DialogDescription className="text-center text-muted-foreground">
                            The AI examiner has finished your evaluation. Here is your result.
                        </DialogDescription>
                    </DialogHeader>
                    
                    <div className="flex flex-col items-center justify-center py-6 space-y-2 bg-muted/30 rounded-xl my-2">
                        <span className="text-sm font-medium text-muted-foreground uppercase tracking-wider">You Scored</span>
                        <div className="flex items-baseline gap-1">
                            <span className="text-6xl font-bold text-primary">
                                {conclusionData?.score ?? 0}
                            </span>
                            <span className="text-xl text-muted-foreground font-medium">/10</span>
                        </div>
                    </div>

                    <DialogFooter className="sm:justify-center">
                        <Button 
                            className="w-full bg-pumpkin hover:bg-pumpkin-600 text-white gap-2 h-11 text-base" 
                            onClick={handleViewReport}
                        >
                            View Detailed Report <ArrowRight className="h-4 w-4" />
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}