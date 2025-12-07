"use client";

import React from "react";
import { useParams, useRouter } from "next/navigation";
import { useVivaResult } from "@/lib/hooks/use-viva-result";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { ResultPageHeader } from "@/components/v/ResultPageHeader";
import { ScoreCard } from "@/components/v/ScoreCard";
import { SummaryCard } from "@/components/v/SummaryCard";
import { FeedbackCard } from "@/components/v/FeedbackCard";

export default function VivaResultPage() {
    const params = useParams();
    const router = useRouter();
    const sessionId = params.id as string;

    const { data: session, isLoading, isError } = useVivaResult(sessionId);

    if (isLoading) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <Loader2 className="h-10 w-10 animate-spin text-primary" />
            </div>
        );
    }

    if (isError || !session || !session.feedback) {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center gap-4">
                <h2 className="text-2xl font-bold">Report Not Found</h2>
                <p className="text-muted-foreground">The viva session results could not be loaded.</p>
                <Button onClick={() => router.push("/")} variant="outline">
                    Return Home
                </Button>
            </div>
        );
    }

    const { score, summary, strong_points, areas_of_improvement } = session.feedback;

    return (
        <div className="min-h-screen bg-background p-4 md:p-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="max-w-5xl mx-auto space-y-8">

                <ResultPageHeader
                    topic={session.topic}
                    startedAt={session.started_at}
                    classLevel={session.class_level}
                    onBack={() => router.push("/")}
                    onShare={() => { }}
                    onDone={() => router.push("/")}
                />

                {/* Score & Summary Grid */}
                <div className="grid md:grid-cols-3 gap-6">
                    <ScoreCard score={score} />
                    <SummaryCard summary={summary} />
                </div>

                {/* Detailed Analysis Grid */}
                <div className="grid md:grid-cols-2 gap-6">
                    <FeedbackCard
                        title="Strong Points"
                        points={strong_points}
                        variant="success"
                        emptyMessage="No specific strengths noted."
                    />
                    <FeedbackCard
                        title="Areas for Improvement"
                        points={areas_of_improvement}
                        variant="warning"
                        emptyMessage="No specific improvements noted."
                    />
                </div>
            </div>
        </div>
    );
}