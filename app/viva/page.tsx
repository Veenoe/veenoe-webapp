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
import { VivaActiveSession } from "@/components/viva/VivaActiveSession";
import { VivaConclusion } from "@/components/viva/VivaConclusion";
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
    const [showInfoDialog, setShowInfoDialog] = useState(false);
    const [studentName, setStudentName] = useState("");
    const [topic, setTopic] = useState("");
    const [classLevel, setClassLevel] = useState("12");
    const [voiceName, setVoiceName] = useState("Kore");
    const [enableThinking, setEnableThinking] = useState(true);
    const [thinkingBudget, setThinkingBudget] = useState(1024);
    const [isStarting, setIsStarting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    /**
     * Start the viva session (Step 1: Backend Init)
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

            // Hide config form and show info dialog
            setShowConfig(false);
            setShowInfoDialog(true);

        } catch (err) {
            console.error("Failed to start session:", err);
            setError(err instanceof Error ? err.message : "Failed to start session");
        } finally {
            setIsStarting(false);
        }
    };

    /**
     * Confirm Start (Step 2: Connect to Gemini)
     */
    const handleConfirmStart = async () => {
        try {
            setShowInfoDialog(false);

            // Initialize Gemini Live connection
            await vivaSession.initializeSession();

            // Start recording
            await vivaSession.startRecording();
        } catch (err) {
            console.error("Failed to connect to Gemini:", err);
            // If connection fails, we might want to show error or go back
            // For now, let's just log it. The session hook handles errors too.
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
                                    "Next"
                                )}
                            </Button>
                        </form>
                    </CardContent>
                </Card>
            </div>
        );
    }

    // Info Dialog Overlay
    if (showInfoDialog) {
        return (
            <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4">
                <Card className="w-full max-w-md border-border shadow-xl animate-in fade-in zoom-in duration-300">
                    <CardHeader>
                        <CardTitle className="text-center text-2xl">Ready for Viva?</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-6">
                        <div className="space-y-4 text-center">
                            <div className="p-4 bg-muted/50 rounded-lg space-y-2">
                                <p className="font-medium text-foreground">To start the viva:</p>
                                <p className="text-muted-foreground italic">"Start Viva"</p>
                                <p className="text-sm text-muted-foreground">(Say this in your preferred language)</p>
                            </div>

                            <div className="p-4 bg-muted/50 rounded-lg space-y-2">
                                <p className="font-medium text-foreground">To end the session at any time:</p>
                                <p className="text-muted-foreground italic">"End Viva"</p>
                                <p className="text-sm text-muted-foreground">(Say this in your preferred language)</p>
                            </div>
                        </div>

                        <Button
                            className="w-full bg-pumpkin hover:bg-pumpkin-600 h-12 text-lg"
                            onClick={handleConfirmStart}
                        >
                            Okay, Start Session
                        </Button>
                    </CardContent>
                </Card>
            </div>
        );
    }

    // Main viva interface
    if (vivaSession.sessionState === SessionState.COMPLETED && vivaSession.conclusionData) {
        return (
            <VivaConclusion
                score={vivaSession.conclusionData.score}
                total={vivaSession.conclusionData.total}
                feedback={vivaSession.conclusionData.feedback}
            />
        );
    }

    return (
        <div className="min-h-screen bg-background p-4 flex flex-col">
            {/* Header with Timer - Only show if not active session component (which has its own timer) */}
            {/* Actually, VivaActiveSession handles the layout now. */}

            <VivaActiveSession
                vivaSession={vivaSession}
                onEndSession={handleEndSession}
            />
        </div>
    );
}
