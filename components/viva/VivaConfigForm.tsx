"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { VoiceSelector } from "@/components/viva/VoiceSelector";
import { Loader2, AlertCircle } from "lucide-react";

export interface VivaConfigData {
    studentName: string;
    topic: string;
    classLevel: string;
    voiceName: string;
}

interface VivaConfigFormProps {
    onSubmit: (data: VivaConfigData) => Promise<void>;
    isSubmitting: boolean;
    error: string | null;
}

export function VivaConfigForm({ onSubmit, isSubmitting, error }: VivaConfigFormProps) {
    const [studentName, setStudentName] = useState("");
    const [topic, setTopic] = useState("");
    const [classLevel, setClassLevel] = useState("12");
    const [voiceName, setVoiceName] = useState("Kore");

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        await onSubmit({ studentName, topic, classLevel, voiceName });
    };

    return (
        <div className="min-h-screen bg-background flex items-center justify-center p-4">
            <Card className="w-full max-w-2xl border-border shadow-lg">
                <CardHeader>
                    <CardTitle className="text-2xl">Quick Setup</CardTitle>
                </CardHeader>
                <CardContent>
                    <form onSubmit={handleSubmit} className="space-y-4">
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

                        {error && (
                            <Alert variant="destructive">
                                <AlertCircle className="h-4 w-4" />
                                <AlertDescription>{error}</AlertDescription>
                            </Alert>
                        )}

                        <Button
                            type="submit"
                            className="w-full bg-pumpkin hover:bg-pumpkin-600"
                            disabled={isSubmitting}
                        >
                            {isSubmitting ? (
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
