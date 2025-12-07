"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TrendingUp } from "lucide-react";

interface SummaryCardProps {
    summary: string;
}

export function SummaryCard({ summary }: SummaryCardProps) {
    return (
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
    );
}
