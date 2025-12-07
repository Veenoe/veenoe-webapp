"use client";

import React from "react";
import { useParams, useRouter } from "next/navigation";
import { useVivaResult } from "@/lib/hooks/use-viva-result";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { 
    Loader2, 
    ArrowLeft, 
    CheckCircle2, 
    AlertCircle, 
    TrendingUp, 
    Share2, 
    Home,
    Calendar,
    BookOpen
} from "lucide-react";

export default function VivaResultPage() {
    const params = useParams();
    const router = useRouter();
    const sessionId = params.id as string;

    // Use our custom hook which uses TanStack Query
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

    // UI Helpers
    const scoreColor = score >= 8 ? "text-green-500" : score >= 5 ? "text-yellow-500" : "text-red-500";
    const scoreBg = score >= 8 ? "bg-green-100 dark:bg-green-900/20" : score >= 5 ? "bg-yellow-100 dark:bg-yellow-900/20" : "bg-red-100 dark:bg-red-900/20";
    
    return (
        <div className="min-h-screen bg-background p-4 md:p-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="max-w-5xl mx-auto space-y-8">
                
                {/* Header Navigation */}
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                    <div>
                        <Button variant="ghost" className="pl-0 gap-2 hover:bg-transparent" onClick={() => router.push("/")}>
                            <ArrowLeft className="h-4 w-4" /> Back to Home
                        </Button>
                        <h1 className="text-3xl md:text-4xl font-bold mt-2">{session.topic} Viva Report</h1>
                        <div className="flex items-center gap-3 text-muted-foreground mt-2 text-sm">
                            <span className="flex items-center gap-1">
                                <Calendar className="h-3.5 w-3.5" />
                                {new Date(session.started_at).toLocaleDateString()}
                            </span>
                            <Separator orientation="vertical" className="h-4" />
                            <span className="flex items-center gap-1">
                                <BookOpen className="h-3.5 w-3.5" />
                                Class {session.class_level}
                            </span>
                        </div>
                    </div>
                    
                    <div className="flex gap-2">
                        <Button variant="outline" className="gap-2">
                            <Share2 className="h-4 w-4" /> Share
                        </Button>
                        <Button onClick={() => router.push("/")} className="gap-2 bg-pumpkin hover:bg-pumpkin-600 text-white">
                            <Home className="h-4 w-4" /> Done
                        </Button>
                    </div>
                </div>

                {/* Score & Summary Grid */}
                <div className="grid md:grid-cols-3 gap-6">
                    {/* Score Card */}
                    <Card className="md:col-span-1 border-none shadow-lg overflow-hidden relative">
                        <div className={`absolute top-0 left-0 w-full h-2 ${score >= 8 ? "bg-green-500" : score >= 5 ? "bg-yellow-500" : "bg-red-500"}`} />
                        <CardContent className="flex flex-col items-center justify-center h-full py-12 space-y-6">
                            <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-widest">Performance Score</h3>
                            <div className={`relative flex items-center justify-center w-40 h-40 rounded-full ${scoreBg}`}>
                                <span className={`text-6xl font-bold ${scoreColor}`}>{score}</span>
                                <span className="text-lg text-muted-foreground absolute bottom-8 font-medium">/10</span>
                            </div>
                            <div className="text-center">
                                {score >= 8 && <Badge className="bg-green-500 hover:bg-green-600 text-white px-4 py-1 text-base">Excellent</Badge>}
                                {score < 8 && score >= 5 && <Badge className="bg-yellow-500 hover:bg-yellow-600 text-white px-4 py-1 text-base">Good Effort</Badge>}
                                {score < 5 && <Badge className="bg-red-500 hover:bg-red-600 text-white px-4 py-1 text-base">Needs Focus</Badge>}
                            </div>
                        </CardContent>
                    </Card>

                    {/* Summary Card */}
                    <Card className="md:col-span-2 shadow-md">
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2 text-xl">
                                <TrendingUp className="h-5 w-5 text-primary" />
                                Examiner Summary
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <p className="text-lg text-muted-foreground leading-relaxed">
                                {summary}
                            </p>
                        </CardContent>
                    </Card>
                </div>

                {/* Detailed Analysis Grid */}
                <div className="grid md:grid-cols-2 gap-6">
                    
                    {/* Strengths */}
                    <Card className="border-l-4 border-l-green-500 shadow-md">
                        <CardHeader className="pb-3">
                            <CardTitle className="flex items-center gap-2 text-green-600 dark:text-green-400">
                                <CheckCircle2 className="h-6 w-6" />
                                Strong Points
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <ul className="space-y-3">
                                {strong_points.map((point, i) => (
                                    <li key={i} className="flex gap-3 items-start p-3 rounded-lg bg-green-50/50 dark:bg-green-900/10">
                                        <span className="mt-1.5 h-2 w-2 rounded-full bg-green-500 shrink-0" />
                                        <span className="text-foreground/90 leading-snug">{point}</span>
                                    </li>
                                ))}
                                {strong_points.length === 0 && <p className="text-muted-foreground italic">No specific strengths noted.</p>}
                            </ul>
                        </CardContent>
                    </Card>

                    {/* Improvements */}
                    <Card className="border-l-4 border-l-orange-500 shadow-md">
                        <CardHeader className="pb-3">
                            <CardTitle className="flex items-center gap-2 text-orange-600 dark:text-orange-400">
                                <AlertCircle className="h-6 w-6" />
                                Areas for Improvement
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <ul className="space-y-3">
                                {areas_of_improvement.map((point, i) => (
                                    <li key={i} className="flex gap-3 items-start p-3 rounded-lg bg-orange-50/50 dark:bg-orange-900/10">
                                        <span className="mt-1.5 h-2 w-2 rounded-full bg-orange-500 shrink-0" />
                                        <span className="text-foreground/90 leading-snug">{point}</span>
                                    </li>
                                ))}
                                {areas_of_improvement.length === 0 && <p className="text-muted-foreground italic">No specific improvements noted.</p>}
                            </ul>
                        </CardContent>
                    </Card>

                </div>
            </div>
        </div>
    );
}