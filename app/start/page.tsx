/**
 * Start Page - Viva Configuration Form
 * Allows users to configure and start a new viva examination
 */

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { VoiceSelector } from "@/components/viva/VoiceSelector";
import { ThinkingConfig } from "@/components/viva/ThinkingConfig";
import { startVivaSession } from "@/lib/api/client";
import { useVivaStore } from "@/lib/store/viva-store";
import { SessionState } from "@/types/viva";
import { Loader2, AlertCircle, GraduationCap } from "lucide-react";

export default function StartPage() {
    const router = useRouter();
    const { setSessionData, setSessionState } = useVivaStore();

    // Form state
    const [studentName, setStudentName] = useState("");
    const [topic, setTopic] = useState("");
    const [classLevel, setClassLevel] = useState("12");
    const [voiceName, setVoiceName] = useState("Kore");
    const [enableThinking, setEnableThinking] = useState(true);
    const [thinkingBudget, setThinkingBudget] = useState(1024);

    // UI state
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    /**
     * Handle form submission
     */
    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);

        // Validation
        if (!studentName.trim()) {
            setError("Please enter your name");
            return;
        }
        if (!topic.trim()) {
            setError("Please enter a topic");
            return;
        }

        const classLevelNum = parseInt(classLevel);
        if (isNaN(classLevelNum) || classLevelNum < 1 || classLevelNum > 12) {
            setError("Class level must be between 1 and 12");
            return;
        }

        setIsLoading(true);

        try {
            // Start viva session
            const response = await startVivaSession({
                student_name: studentName.trim(),
                topic: topic.trim(),
                class_level: classLevelNum,
                voice_name: voiceName,
                enable_thinking: enableThinking,
                thinking_budget: enableThinking ? thinkingBudget : 0,
            });

            // Save session data to store
            setSessionData(response);
            setSessionState(SessionState.IDLE);

            // Navigate to viva page
            router.push(`/viva/${response.viva_session_id}`);
        } catch (err) {
            console.error("Failed to start viva:", err);
            setError(
                err instanceof Error ? err.message : "Failed to start viva session"
            );
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-background flex items-center justify-center p-4">
            <Card className="w-full max-w-2xl border-border shadow-lg">
                <CardHeader className="space-y-1">
                    <div className="flex items-center gap-2">
                        <div className="p-2 rounded-lg bg-pumpkin/10">
                            <GraduationCap className="h-6 w-6 text-pumpkin" />
                        </div>
                        <CardTitle className="text-2xl font-bold">
                            Start Viva Examination
                        </CardTitle>
                    </div>
                    <CardDescription>
                        Configure your AI-powered viva examination. Session duration: 10 minutes.
                    </CardDescription>
                </CardHeader>

                <CardContent>
                    <form onSubmit={handleSubmit} className="space-y-6">
                        {/* Student Name */}
                        <div className="space-y-2">
                            <Label htmlFor="student-name">Student Name *</Label>
                            <Input
                                id="student-name"
                                type="text"
                                placeholder="Enter your full name"
                                value={studentName}
                                onChange={(e) => setStudentName(e.target.value)}
                                disabled={isLoading}
                                className="bg-card border-border"
                                required
                            />
                        </div>

                        {/* Topic */}
                        <div className="space-y-2">
                            <Label htmlFor="topic">Topic *</Label>
                            <Input
                                id="topic"
                                type="text"
                                placeholder="e.g., Python Programming, World History, Biology"
                                value={topic}
                                onChange={(e) => setTopic(e.target.value)}
                                disabled={isLoading}
                                className="bg-card border-border"
                                required
                            />
                        </div>

                        {/* Class Level */}
                        <div className="space-y-2">
                            <Label htmlFor="class-level">Class Level (1-12) *</Label>
                            <Input
                                id="class-level"
                                type="number"
                                min="1"
                                max="12"
                                placeholder="12"
                                value={classLevel}
                                onChange={(e) => setClassLevel(e.target.value)}
                                disabled={isLoading}
                                className="bg-card border-border"
                                required
                            />
                        </div>

                        {/* Voice Selection */}
                        <VoiceSelector
                            value={voiceName}
                            onValueChange={setVoiceName}
                            disabled={isLoading}
                        />

                        {/* Thinking Configuration */}
                        <ThinkingConfig
                            enabled={enableThinking}
                            budget={thinkingBudget}
                            onEnabledChange={setEnableThinking}
                            onBudgetChange={setThinkingBudget}
                            disabled={isLoading}
                        />

                        {/* Error Alert */}
                        {error && (
                            <Alert variant="destructive">
                                <AlertCircle className="h-4 w-4" />
                                <AlertDescription>{error}</AlertDescription>
                            </Alert>
                        )}

                        {/* Submit Button */}
                        <Button
                            type="submit"
                            className="w-full bg-pumpkin hover:bg-pumpkin-600 text-white"
                            disabled={isLoading}
                            size="lg"
                        >
                            {isLoading ? (
                                <>
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    Starting Viva...
                                </>
                            ) : (
                                "Start Viva Examination"
                            )}
                        </Button>

                        <p className="text-xs text-center text-muted-foreground">
                            By starting, you agree to the 10-minute session limit. Make sure your microphone is working.
                        </p>
                    </form>
                </CardContent>
            </Card>
        </div>
    );
}
