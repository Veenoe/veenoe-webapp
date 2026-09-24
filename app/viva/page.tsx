"use client";

import { useState } from "react";
import { useVivaSession } from "@/lib/hooks/useVivaSession";
import { startVivaSession, setTokenGetter } from "@/lib/api/axios";
import { VivaActiveSession } from "@/components/viva/VivaActiveSession";
import { VivaConfigForm } from "@/components/viva/VivaConfigForm";
import { VivaConfigData } from "@/lib/hooks/viva/useVivaSessionConfig";
import { VivaInfoDialog } from "@/components/viva/VivaInfoDialog";
import { VoiceDiagnosticsPanel } from "@/components/viva/VoiceDiagnosticsPanel";
import { useUser, useAuth } from "@clerk/nextjs";

export default function VivaRoomPage() {
    const vivaSession = useVivaSession();
    const { user } = useUser();
    const { getToken } = useAuth();

    // Pre-session configuration state
    const [showConfig, setShowConfig] = useState(true);
    const [showInfoDialog, setShowInfoDialog] = useState(false);
    const [isStarting, setIsStarting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleConfigSubmit = async (data: VivaConfigData) => {
        setError(null);

        if (!user) {
            setError("You must be logged in to start a session.");
            return;
        }

        if (!data.studentName.trim() || !data.topic.trim() || !data.classLevel.trim()) {
            setError("Please fill in all required fields");
            return;
        }

        setIsStarting(true);

        try {
            // Configure auth token getter to avoid race conditions
            setTokenGetter(() => getToken());

            // Reset previous session state to prevent "ghost" messages
            vivaSession.resetSession();

            const response = await startVivaSession({
                student_name: data.studentName.trim(),
                // user_id removed - now extracted from JWT on server
                topic: data.topic.trim(),
                class_level: data.classLevel,
                session_type: "viva",
                voice_name: data.voiceName,
                enable_thinking: false,
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
            await vivaSession.initializeSession();
        } catch (err) {
            console.error("Failed to connect to Gemini:", err);
        }
    };

    if (showConfig) {
        return (
            <VivaConfigForm
                onSubmit={handleConfigSubmit}
                isSubmitting={isStarting}
                error={error}
            />
        );
    }

    if (showInfoDialog) {
        return (
            <VivaInfoDialog
                open={showInfoDialog}
                onConfirm={handleConfirmStart}
            />
        );
    }

    return (
        <div className="min-h-screen bg-background p-4 flex flex-col relative">
            <VivaActiveSession vivaSession={vivaSession} />
            <VoiceDiagnosticsPanel />
        </div>
    );
}