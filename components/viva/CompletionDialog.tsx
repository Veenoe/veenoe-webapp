"use client";

import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Trophy, ArrowRight } from "lucide-react";

interface CompletionDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    score: number;
    onViewReport: () => void;
}

export function CompletionDialog({
    open,
    onOpenChange,
    score,
    onViewReport,
}: CompletionDialogProps) {
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-md text-center">
                <DialogHeader>
                    <div className="mx-auto bg-green-100 p-3 rounded-full w-fit mb-4">
                        <Trophy className="h-8 w-8 text-green-600" />
                    </div>
                    <DialogTitle className="text-2xl text-center">Viva Concluded!</DialogTitle>
                    <DialogDescription className="text-center text-muted-foreground">
                        The AI examiner has finished your evaluation. Here is your result.
                    </DialogDescription>
                </DialogHeader>

                <div className="flex flex-col items-center justify-center py-6 space-y-2 bg-muted/30 rounded-xl my-2">
                    <span className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
                        You Scored
                    </span>
                    <div className="flex items-baseline gap-1">
                        <span className="text-6xl font-bold text-primary">{score}</span>
                        <span className="text-xl text-muted-foreground font-medium">/10</span>
                    </div>
                </div>

                <DialogFooter className="sm:justify-center">
                    <Button
                        className="w-full bg-pumpkin hover:bg-pumpkin-600 text-white gap-2 h-11 text-base"
                        onClick={onViewReport}
                    >
                        View Detailed Report <ArrowRight className="h-4 w-4" />
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
