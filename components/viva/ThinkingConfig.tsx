/**
 * Thinking Configuration Component
 * Allows users to configure AI thinking capabilities
 */

"use client";

import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Brain } from "lucide-react";

interface ThinkingConfigProps {
    enabled: boolean;
    budget: number;
    onEnabledChange: (enabled: boolean) => void;
    onBudgetChange: (budget: number) => void;
    disabled?: boolean;
}

/**
 * Thinking configuration component
 * Using native input range to avoid React 19 + Radix UI compatibility issues
 */
export function ThinkingConfig({
    enabled,
    budget,
    onEnabledChange,
    onBudgetChange,
    disabled = false,
}: ThinkingConfigProps) {
    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <Brain className="h-4 w-4 text-pumpkin" />
                    <Label className="text-sm font-medium">Thinking Capabilities</Label>
                </div>
                <button
                    type="button"
                    onClick={() => onEnabledChange(!enabled)}
                    disabled={disabled}
                    className={`
            relative inline-flex h-6 w-11 items-center rounded-full transition-colors
            ${enabled ? "bg-pumpkin" : "bg-muted"}
            ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}
          `}
                >
                    <span
                        className={`
              inline-block h-4 w-4 transform rounded-full bg-white transition-transform
              ${enabled ? "translate-x-6" : "translate-x-1"}
            `}
                    />
                </button>
            </div>

            {enabled && (
                <div className="space-y-3">
                    <div className="flex items-center justify-between">
                        <Label htmlFor="thinking-budget" className="text-sm text-muted-foreground">
                            Thinking Budget
                        </Label>
                        <Badge variant="secondary" className="font-mono">
                            {budget} tokens
                        </Badge>
                    </div>
                    <input
                        type="range"
                        id="thinking-budget"
                        min="0"
                        max="8192"
                        step="256"
                        value={budget}
                        onChange={(e) => onBudgetChange(parseInt(e.target.value))}
                        disabled={disabled}
                        className="w-full h-2 bg-muted rounded-lg appearance-none cursor-pointer accent-pumpkin disabled:opacity-50 disabled:cursor-not-allowed"
                    />
                    <p className="text-xs text-muted-foreground">
                        Higher budget allows for more complex reasoning
                    </p>
                </div>
            )}
        </div>
    );
}
