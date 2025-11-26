"use client";

import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { Brain } from "lucide-react";

interface ThinkingConfigProps {
  enabled: boolean;
  budget: number;
  onEnabledChange: (enabled: boolean) => void;
  onBudgetChange: (budget: number) => void;
  disabled?: boolean;
}

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
        
        {/* Toggle Button (Kept custom to avoid extra Switch dependency) */}
        <button
          type="button"
          onClick={() => onEnabledChange(!enabled)}
          disabled={disabled}
          className={`
            relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2
            ${enabled ? "bg-pumpkin" : "bg-muted"}
            ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}
          `}
          aria-pressed={enabled}
        >
          <span className="sr-only">Toggle thinking</span>
          <span
            className={`
              inline-block h-4 w-4 transform rounded-full bg-white transition-transform
              ${enabled ? "translate-x-6" : "translate-x-1"}
            `}
          />
        </button>
      </div>

      {enabled && (
        <div className="space-y-4 pt-2">
          <div className="flex items-center justify-between">
            <Label className="text-sm text-muted-foreground">
              Thinking Budget
            </Label>
            <Badge variant="secondary" className="font-mono">
              {budget} tokens
            </Badge>
          </div>
          
          {/* Shadcn Slider Implementation */}
          <Slider
            value={[budget]}
            min={0}
            max={8192}
            step={256}
            onValueChange={(vals) => onBudgetChange(vals[0])}
            disabled={disabled}
            className="w-full"
            aria-label="Thinking budget slider"
          />
          
          <p className="text-xs text-muted-foreground">
            Higher budget allows for more complex reasoning
          </p>
        </div>
      )}
    </div>
  );
}