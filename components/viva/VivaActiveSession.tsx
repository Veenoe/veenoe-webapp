"use client";

import { SessionTimer } from "./SessionTimer";
import { VoiceVisualizer } from "./VoiceVisualizer";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Mic, MicOff, PhoneOff } from "lucide-react";
import { useVivaSession } from "@/lib/hooks/useVivaSession";
import { AudioState } from "@/types/viva";

interface VivaActiveSessionProps {
    vivaSession: ReturnType<typeof useVivaSession>;
    onEndSession: () => void;
}

export function VivaActiveSession({ vivaSession, onEndSession }: VivaActiveSessionProps) {
    const { audioState, isMuted, toggleMute, transcripts } = vivaSession;

    // Get the last assistant message to display
    const lastAssistantMessage = transcripts
        .filter(t => t.role === "assistant")
        .slice(-1)[0]?.text;

    return (
        <div className="flex flex-col items-center justify-center min-h-[80vh] space-y-8 max-w-4xl mx-auto w-full">
            {/* Timer Section */}
            <div className="w-full flex justify-center">
                <SessionTimer />
            </div>

            {/* Visualizer Section - The Centerpiece */}
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
                    className={`h-14 w-14 rounded-full border-2 ${isMuted ? "border-destructive text-destructive bg-destructive/10" : "border-primary text-primary"
                        }`}
                    onClick={toggleMute}
                >
                    {isMuted ? <MicOff className="h-6 w-6" /> : <Mic className="h-6 w-6" />}
                </Button>

                <Button
                    variant="destructive"
                    size="lg"
                    className="h-14 px-8 rounded-full text-lg font-medium shadow-lg hover:shadow-xl transition-all"
                    onClick={onEndSession}
                >
                    <PhoneOff className="mr-2 h-5 w-5" />
                    End Session
                </Button>
            </div>

            {/* Transcript Display Section */}
            <div className="w-full max-w-3xl text-center space-y-4 min-h-[120px] flex flex-col justify-center px-4">
                {lastAssistantMessage ? (
                    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                        <p className="text-xl md:text-2xl font-medium text-foreground leading-relaxed">
                            "{lastAssistantMessage}"
                        </p>
                    </div>
                ) : (
                    <p className="text-xl text-muted-foreground animate-pulse">
                        Listening...
                    </p>
                )}
            </div>
        </div>
    );
}
