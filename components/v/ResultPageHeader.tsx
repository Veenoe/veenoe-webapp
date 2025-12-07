"use client";

import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { ArrowLeft, Share2, Home, Calendar, BookOpen } from "lucide-react";

interface ResultPageHeaderProps {
    topic: string;
    startedAt: string;
    classLevel: number;
    onBack: () => void;
    onShare: () => void;
    onDone: () => void;
}

export function ResultPageHeader({
    topic,
    startedAt,
    classLevel,
    onBack,
    onShare,
    onDone,
}: ResultPageHeaderProps) {
    return (
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div>
                <Button variant="ghost" className="pl-0 gap-2 hover:bg-transparent" onClick={onBack}>
                    <ArrowLeft className="h-4 w-4" /> Back to Home
                </Button>
                <h1 className="text-3xl md:text-4xl font-bold mt-2">{topic} Viva Report</h1>
                <div className="flex items-center gap-3 text-muted-foreground mt-2 text-sm">
                    <span className="flex items-center gap-1">
                        <Calendar className="h-3.5 w-3.5" />
                        {new Date(startedAt).toLocaleDateString()}
                    </span>
                    <Separator orientation="vertical" className="h-4" />
                    <span className="flex items-center gap-1">
                        <BookOpen className="h-3.5 w-3.5" />
                        Class {classLevel}
                    </span>
                </div>
            </div>

            <div className="flex gap-2">
                <Button variant="outline" className="gap-2" onClick={onShare}>
                    <Share2 className="h-4 w-4" /> Share
                </Button>
                <Button onClick={onDone} className="gap-2 bg-pumpkin hover:bg-pumpkin-600 text-white">
                    <Home className="h-4 w-4" /> Done
                </Button>
            </div>
        </div>
    );
}
