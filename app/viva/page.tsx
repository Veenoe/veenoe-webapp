"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { VoiceSelector } from "@/components/viva/VoiceSelector";
import { ThinkingConfig } from "@/components/viva/ThinkingConfig";
import { useVivaSession } from "@/lib/hooks/useVivaSession";
import { startVivaSession } from "@/lib/api/client";
import { VivaActiveSession } from "@/components/viva/VivaActiveSession";
import { useUser } from "@clerk/nextjs";
import {
    Loader2,
    AlertCircle,
} from "lucide-react";

export default function VivaRoomPage() {
    const router = useRouter();
    const vivaSession = useVivaSession();
    const { user } = useUser();

    // Pre-session configuration state
    const [showConfig, setShowConfig] = useState(true);
    const [showInfoDialog, setShowInfoDialog] = useState(false);
    const [studentName, setStudentName] = useState("");
    const [topic, setTopic] = useState("");
    const [classLevel, setClassLevel] = useState("12");
    const [voiceName, setVoiceName] = useState("Kore");
    // Removed Thinking State as per new simple architecture
    // const [enableThinking, setEnableThinking] = useState(true);
    // const [thinkingBudget, setThinkingBudget] = useState(1024);
    
    const [isStarting, setIsStarting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleStartSession = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);

        if (!user) {
            setError("You must be logged in to start a session.");
            return;
        }

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
            const response = await startVivaSession({
                student_name: studentName.trim(),
                user_id: user.id,
                topic: topic.trim(),
                class_level: classLevelNum,
                session_type: "viva",
                voice_name: voiceName,
                enable_thinking: false, // Disabled for simplicity
                thinking_budget: 0,
            });

            vivaSession.setSessionData(response);
            setShowConfig(false);
            setShowInfoDialog(true);

        } catch (err) {
            console.error("Failed to start session:", err);
            setError(err instanceof Error ? err.message : "Failed to start session");
        } finally {
            setIsStarting(false);
        }
    };

    const handleConfirmStart = async () => {
        try {
            setShowInfoDialog(false);
            // Just initialize. Recording starts automatically inside initializeSession
            await vivaSession.initializeSession();
        } catch (err) {
            console.error("Failed to connect to Gemini:", err);
        }
    };

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

                            {/* Removed Thinking Config Component */}

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
                                <p className="font-medium text-foreground">AI will start speaking immediately.</p>
                                <p className="text-sm text-muted-foreground">The session is timed for 5 minutes.</p>
                            </div>
                        </div>

                        <Button
                            className="w-full bg-pumpkin hover:bg-pumpkin-600 h-12 text-lg"
                            onClick={handleConfirmStart}
                        >
                            Start Session
                        </Button>
                    </CardContent>
                </Card>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-background p-4 flex flex-col">
            <VivaActiveSession vivaSession={vivaSession} />
        </div>
    );
}