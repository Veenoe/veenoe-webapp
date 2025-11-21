/**
 * Viva Room Page - Main Viva Interface
 * Handles the complete viva examination flow with voice interaction
 */

"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { VoiceSelector } from "@/components/viva/VoiceSelector";
import { ThinkingConfig } from "@/components/viva/ThinkingConfig";
import { SessionTimer } from "@/components/viva/SessionTimer";
import { useVivaSession } from "@/lib/hooks/useVivaSession";
import { startVivaSession } from "@/lib/api/client";
import { SessionState, AudioState } from "@/types/viva";
import {
    Loader2,
    Mic,
    MicOff,
    Phone,
    PhoneOff,
    AlertCircle,
    CheckCircle2,
} from "lucide-react";

export default function VivaRoomPage() {
    const router = useRouter();
    const vivaSession = useVivaSession();

    // Pre-session configuration state
    const [showConfig, setShowConfig] = useState(true);
    const [studentName, setStudentName] = useState("");
    const [topic, setTopic] = useState("");
    const [classLevel, setClassLevel] = useState("12");
    const [voiceName, setVoiceName] = useState("Kore");
    const [enableThinking, setEnableThinking] = useState(true);
    const [thinkingBudget, setThinkingBudget] = useState(1024);
    const [isStarting, setIsStarting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    /**
     * Start the viva session
     */
    const handleStartSession = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);

        // Validation
        if (!studentName.trim() || !topic.trim()) {
            setError("Please fill in all required fields");
            return;
        }

        const classLevelNum = parseInt(classLevel);
        if (isNaN(classLevelNum) || classLevelNum < 1 || classLevelNum > 12) {
            setError("Class level must be between 1 and 12");
            return;
        }

        setIsStarting(true);

        try {
            // Start viva session via backend
            const response = await startVivaSession({
                student_name: studentName.trim(),
                topic: topic.trim(),
                class_level: classLevelNum,
                voice_name: voiceName,
                enable_thinking: enableThinking,
                thinking_budget: enableThinking ? thinkingBudget : 0,
            });

            // Save session data
            vivaSession.setSessionData(response);

            // Hide config form
            setShowConfig(false);

            // Initialize Gemini Live connection
            await vivaSession.initializeSession();

            // Start recording
            await vivaSession.startRecording();
        } catch (err) {
            console.error("Failed to start session:", err);
            setError(err instanceof Error ? err.message : "Failed to start session");
        } finally {
            setIsStarting(false);
        }
    };

    /**
     * End the session
     */
    const handleEndSession = () => {
        vivaSession.endSession();
        router.push("/");
    };

    /**
     * Toggle microphone mute
     */
    const handleToggleMute = () => {
        vivaSession.toggleMute();
    };

    // Show configuration form before session starts
    if (showConfig) {
        return (
            <div className="min-h-screen bg-background flex items-center justify-center p-4">
                <Card className="w-full max-w-2xl border-border shadow-lg">
                    <CardHeader>
                        <CardTitle className="text-2xl">Quick Setup</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <form onSubmit={handleStartSession} className="space-y-4">
                            <div className="space-y-2">
                                <Label htmlFor="name">Your Name *</Label>
                                <Input
                                    id="name"
                                    value={studentName}
                                    onChange={(e) => setStudentName(e.target.value)}
                                    placeholder="Enter your name"
                                    required
                                />
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="topic">Topic *</Label>
                                <Input
                                    id="topic"
                                    value={topic}
                                    onChange={(e) => setTopic(e.target.value)}
                                    placeholder="e.g., Python, History, Biology"
                                    required
                                />
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="class">Class Level (1-12) *</Label>
                                <Input
                                    id="class"
                                    type="number"
                                    min="1"
                                    max="12"
                                    value={classLevel}
                                    onChange={(e) => setClassLevel(e.target.value)}
                                    required
                                />
                            </div>

                            <VoiceSelector value={voiceName} onValueChange={setVoiceName} />

                            <ThinkingConfig
                                enabled={enableThinking}
                                budget={thinkingBudget}
                                onEnabledChange={setEnableThinking}
                                onBudgetChange={setThinkingBudget}
                            />

                            {error && (
                                <Alert variant="destructive">
                                    <AlertCircle className="h-4 w-4" />
                                    <AlertDescription>{error}</AlertDescription>
                                </Alert>
                            )}

                            <Button
                                type="submit"
                                className="w-full bg-pumpkin hover:bg-pumpkin-600"
                                disabled={isStarting}
                            >
                                {isStarting ? (
                                    <>
                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                        Starting...
                                    </>
                                ) : (
                                    "Start Viva"
                                )}
                            </Button>
                        </form>
                    </CardContent>
                </Card>
            </div>
        );
    }

    // Main viva interface
    return (
        <div className="min-h-screen bg-background p-4">
            <div className="container mx-auto max-w-6xl space-y-4">
                {/* Header with Timer */}
                <Card className="border-border">
                    <CardContent className="pt-6">
                        <SessionTimer />
                    </CardContent>
                </Card>

                {/* Main Content Grid */}
                <div className="grid md:grid-cols-2 gap-4">
                    {/* Left: Current Question */}
                    <Card className="border-border">
                        <CardHeader>
                            <CardTitle className="text-lg">Current Question</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            {vivaSession.currentQuestion ? (
                                <div className="space-y-2">
                                    <p className="text-foreground">
                                        {vivaSession.currentQuestion.question_text}
                                    </p>
                                    <div className="flex items-center gap-2">
                                        <span className="text-xs text-muted-foreground">
                                            Difficulty:
                                        </span>
                                        <div className="flex gap-1">
                                            {Array.from({ length: 5 }).map((_, i) => (
                                                <div
                                                    key={i}
                                                    className={`h-2 w-2 rounded-full ${i < vivaSession.currentQuestion!.difficulty
                                                            ? "bg-pumpkin"
                                                            : "bg-muted"
                                                        }`}
                                                />
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <p className="text-muted-foreground italic">
                                    Waiting for first question...
                                </p>
                            )}
                        </CardContent>
                    </Card>

                    {/* Right: Transcripts */}
                    <Card className="border-border">
                        <CardHeader>
                            <CardTitle className="text-lg">Conversation</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="space-y-3 max-h-[300px] overflow-y-auto">
                                {vivaSession.transcripts.length === 0 ? (
                                    <p className="text-muted-foreground italic text-sm">
                                        Conversation will appear here...
                                    </p>
                                ) : (
                                    vivaSession.transcripts.map((transcript) => (
                                        <div
                                            key={transcript.id}
                                            className={`p-3 rounded-lg ${transcript.role === "user"
                                                    ? "bg-pumpkin/10 ml-4"
                                                    : "bg-muted mr-4"
                                                }`}
                                        >
                                            <p className="text-xs text-muted-foreground mb-1">
                                                {transcript.role === "user" ? "You" : "AI Examiner"}
                                            </p>
                                            <p className="text-sm">{transcript.text}</p>
                                        </div>
                                    ))
                                )}
                            </div>
                        </CardContent>
                    </Card>
                </div>

                {/* Controls */}
                <Card className="border-border">
                    <CardContent className="pt-6">
                        <div className="flex items-center justify-center gap-4">
                            {/* Mute/Unmute Button */}
                            <Button
                                variant="outline"
                                size="lg"
                                onClick={handleToggleMute}
                                className={vivaSession.isMuted ? "border-destructive" : ""}
                            >
                                {vivaSession.isMuted ? (
                                    <>
                                        <MicOff className="mr-2 h-5 w-5" />
                                        Unmute
                                    </>
                                ) : (
                                    <>
                                        <Mic className="mr-2 h-5 w-5" />
                                        Mute
                                    </>
                                )}
                            </Button>

                            {/* Recording Indicator */}
                            {vivaSession.audioState === AudioState.RECORDING && (
                                <div className="flex items-center gap-2 text-sm text-pumpkin">
                                    <div className="h-3 w-3 rounded-full bg-pumpkin animate-pulse" />
                                    Recording...
                                </div>
                            )}

                            {/* End Session Button */}
                            <Button
                                variant="destructive"
                                size="lg"
                                onClick={handleEndSession}
                            >
                                <PhoneOff className="mr-2 h-5 w-5" />
                                End Session
                            </Button>
                        </div>

                        {/* Status Messages */}
                        {vivaSession.sessionState === SessionState.STARTING && (
                            <Alert className="mt-4">
                                <Loader2 className="h-4 w-4 animate-spin" />
                                <AlertDescription>
                                    Connecting to AI examiner...
                                </AlertDescription>
                            </Alert>
                        )}

                        {vivaSession.sessionState === SessionState.ACTIVE && (
                            <Alert className="mt-4 border-pumpkin/50 bg-pumpkin/5">
                                <CheckCircle2 className="h-4 w-4 text-pumpkin" />
                                <AlertDescription className="text-pumpkin">
                                    Session active • Speak naturally with the AI examiner
                                </AlertDescription>
                            </Alert>
                        )}

                        {vivaSession.error && (
                            <Alert variant="destructive" className="mt-4">
                                <AlertCircle className="h-4 w-4" />
                                <AlertDescription>{vivaSession.error}</AlertDescription>
                            </Alert>
                        )}
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
