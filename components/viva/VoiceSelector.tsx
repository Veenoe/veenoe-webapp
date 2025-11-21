/**
 * Voice Selector Component
 * Allows users to choose the AI voice for the viva examination
 */

"use client";

import { Label } from "@/components/ui/label";
import { AVAILABLE_VOICES } from "@/types/viva";

interface VoiceSelectorProps {
    value: string;
    onValueChange: (value: string) => void;
    disabled?: boolean;
}

/**
 * Voice selector component for choosing AI voice
 * Using native select to avoid React 19 + Radix UI compatibility issues
 */
export function VoiceSelector({
    value,
    onValueChange,
    disabled = false,
}: VoiceSelectorProps) {
    return (
        <div className="space-y-2">
            <Label htmlFor="voice-select" className="text-sm font-medium">
                AI Voice
            </Label>
            <select
                id="voice-select"
                value={value}
                onChange={(e) => onValueChange(e.target.value)}
                disabled={disabled}
                className="flex h-9 w-full items-center justify-between rounded-md border border-input bg-card px-3 py-2 text-sm shadow-xs ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            >
                {AVAILABLE_VOICES.map((voice) => (
                    <option key={voice.value} value={voice.value}>
                        {voice.label}
                    </option>
                ))}
            </select>
            <p className="text-xs text-muted-foreground">
                Choose the voice for your AI examiner
            </p>
        </div>
    );
}
