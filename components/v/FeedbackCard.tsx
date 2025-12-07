"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle2, AlertCircle, LucideIcon } from "lucide-react";

interface FeedbackCardProps {
    title: string;
    points: string[];
    variant: "success" | "warning";
    emptyMessage: string;
}

export function FeedbackCard({ title, points, variant, emptyMessage }: FeedbackCardProps) {
    const isSuccess = variant === "success";

    const borderColor = isSuccess ? "border-l-green-500" : "border-l-orange-500";
    const titleColor = isSuccess
        ? "text-green-600 dark:text-green-400"
        : "text-orange-600 dark:text-orange-400";
    const bgColor = isSuccess
        ? "bg-green-50/50 dark:bg-green-900/10"
        : "bg-orange-50/50 dark:bg-orange-900/10";
    const dotColor = isSuccess ? "bg-green-500" : "bg-orange-500";
    const Icon: LucideIcon = isSuccess ? CheckCircle2 : AlertCircle;

    return (
        <Card className={`border-l-4 ${borderColor} shadow-md`}>
            <CardHeader className="pb-3">
                <CardTitle className={`flex items-center gap-2 ${titleColor}`}>
                    <Icon className="h-6 w-6" />
                    {title}
                </CardTitle>
            </CardHeader>
            <CardContent>
                <ul className="space-y-3">
                    {points.map((point, i) => (
                        <li key={i} className={`flex gap-3 items-start p-3 rounded-lg ${bgColor}`}>
                            <span className={`mt-1.5 h-2 w-2 rounded-full ${dotColor} shrink-0`} />
                            <span className="text-foreground/90 leading-snug">{point}</span>
                        </li>
                    ))}
                    {points.length === 0 && <p className="text-muted-foreground italic">{emptyMessage}</p>}
                </ul>
            </CardContent>
        </Card>
    );
}
