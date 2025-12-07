"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

interface VivaInfoDialogProps {
    open: boolean;
    onConfirm: () => void;
}

export function VivaInfoDialog({ open, onConfirm }: VivaInfoDialogProps) {
    if (!open) return null;

    return (
        <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4">
            <Card className="w-full max-w-md border-border shadow-xl animate-in fade-in zoom-in duration-300">
                <CardHeader>
                    <CardTitle className="text-center text-2xl">Ready for Viva?</CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                    <div className="space-y-4 text-center">
                        <p className="text-muted-foreground">To start the viva, say</p>
                        <p className="text-3xl font-bold text-pumpkin animate-pulse drop-shadow-[0_0_15px_rgba(255,107,0,0.5)]">
                            "Start the Viva"
                        </p>
                        <p className="text-xs text-muted-foreground mt-4">Session is timed for 5 minutes</p>
                    </div>

                    <Button
                        className="w-full bg-pumpkin hover:bg-pumpkin-600 h-12 text-lg"
                        onClick={onConfirm}
                    >
                        Start Session
                    </Button>
                </CardContent>
            </Card>
        </div>
    );
}
