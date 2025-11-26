"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle2, Home } from "lucide-react";
import { useRouter } from "next/navigation";
import { motion } from "motion/react";

interface VivaConclusionProps {
    score: number;
    total: number;
    feedback: string;
}

export function VivaConclusion({ score, total, feedback }: VivaConclusionProps) {
    const router = useRouter();

    return (
        <div className="min-h-screen flex items-center justify-center p-4 bg-background">
            <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.5 }}
                className="w-full max-w-md"
            >
                <Card className="border-border shadow-xl">
                    <CardHeader className="text-center pb-2">
                        <div className="mx-auto mb-4 bg-green-100 dark:bg-green-900/20 p-3 rounded-full w-fit">
                            <CheckCircle2 className="h-10 w-10 text-green-600 dark:text-green-400" />
                        </div>
                        <CardTitle className="text-2xl font-bold text-foreground">
                            Viva Ended Successfully
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-6 text-center">
                        <div className="space-y-2">
                            <p className="text-muted-foreground">Your Score</p>
                            <div className="text-5xl font-bold text-primary">
                                {score}<span className="text-2xl text-muted-foreground">/{total}</span>
                            </div>
                        </div>

                        {feedback && (
                            <div className="bg-muted/50 p-4 rounded-lg text-sm text-left">
                                <p className="font-medium mb-1">Feedback:</p>
                                <p className="text-muted-foreground">{feedback}</p>
                            </div>
                        )}

                        <Button
                            className="w-full bg-primary hover:bg-primary/90"
                            size="lg"
                            onClick={() => router.push("/")}
                        >
                            <Home className="mr-2 h-4 w-4" />
                            Back to Home
                        </Button>
                    </CardContent>
                </Card>
            </motion.div>
        </div>
    );
}
