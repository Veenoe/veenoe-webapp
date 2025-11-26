"use client";

import { motion } from "motion/react";
import { AudioState } from "@/types/viva";

interface VoiceVisualizerProps {
    audioState: AudioState;
    isMuted: boolean;
}

export function VoiceVisualizer({ audioState, isMuted }: VoiceVisualizerProps) {
    // Determine the color and animation based on state
    const isUserSpeaking = audioState === AudioState.RECORDING && !isMuted;
    const isAISpeaking = audioState === AudioState.PLAYING;

    // Base bars configuration
    const bars = Array.from({ length: 5 });

    return (
        <div className="flex items-center justify-center h-32 w-full">
            <div className="flex items-center gap-2">
                {bars.map((_, i) => (
                    <motion.div
                        key={i}
                        className={`w-3 rounded-full ${isAISpeaking
                                ? "bg-blue-500"
                                : isUserSpeaking
                                    ? "bg-pumpkin"
                                    : "bg-muted"
                            }`}
                        animate={{
                            height: (isUserSpeaking || isAISpeaking)
                                ? [20, Math.random() * 60 + 20, 20]
                                : 10,
                        }}
                        transition={{
                            duration: 0.5,
                            repeat: Infinity,
                            repeatType: "reverse",
                            delay: i * 0.1,
                            ease: "easeInOut"
                        }}
                    />
                ))}
            </div>

            {/* Status Text */}
            <div className="absolute mt-40 text-sm font-medium text-muted-foreground">
                {isAISpeaking ? (
                    <span className="text-blue-500 animate-pulse">AI is speaking...</span>
                ) : isUserSpeaking ? (
                    <span className="text-pumpkin animate-pulse">Listening...</span>
                ) : (
                    <span>Waiting...</span>
                )}
            </div>
        </div>
    );
}
