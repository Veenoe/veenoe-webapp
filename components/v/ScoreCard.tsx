"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface ScoreCardProps {
    score: number;
}

export function ScoreCard({ score }: ScoreCardProps) {
    const scoreColor = score >= 8 ? "text-green-500" : score >= 5 ? "text-yellow-500" : "text-red-500";
    const scoreBg = score >= 8 ? "bg-green-100 dark:bg-green-900/20" : score >= 5 ? "bg-yellow-100 dark:bg-yellow-900/20" : "bg-red-100 dark:bg-red-900/20";
    const barColor = score >= 8 ? "bg-green-500" : score >= 5 ? "bg-yellow-500" : "bg-red-500";

    return (
        <Card className="md:col-span-1 border-none shadow-lg overflow-hidden relative">
            <div className={`absolute top-0 left-0 w-full h-2 ${barColor}`} />
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
    );
}
