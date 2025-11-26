"use client";

import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AVAILABLE_VOICES } from "@/types/viva";

interface VoiceSelectorProps {
  value: string;
  onValueChange: (value: string) => void;
  disabled?: boolean;
}

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
      <Select 
        value={value} 
        onValueChange={onValueChange} 
        disabled={disabled}
      >
        <SelectTrigger id="voice-select" className="w-full bg-card">
          <SelectValue placeholder="Select a voice" />
        </SelectTrigger>
        <SelectContent>
          {AVAILABLE_VOICES.map((voice) => (
            <SelectItem key={voice.value} value={voice.value}>
              {voice.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <p className="text-xs text-muted-foreground">
        Choose the voice for your AI examiner
      </p>
    </div>
  );
}