"use client";

import { motion } from "motion/react";
import { MicrophoneState, PlaybackState } from "@/types/viva";

interface VoiceVisualizerProps {
    isConnecting: boolean;
    microphoneState: MicrophoneState;
    playbackState: PlaybackState;
    isMuted: boolean;
}

export function VoiceVisualizer({ isConnecting, microphoneState, playbackState, isMuted }: VoiceVisualizerProps) {
    // Determine the color and animation based on state
    const isListening = microphoneState === MicrophoneState.ACTIVE && !isMuted;
    const isAISpeaking = playbackState === PlaybackState.PLAYING;

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
                                : isListening
                                    ? "bg-pumpkin"
                                    : "bg-muted"
                            }`}
                        animate={{
                            height: (isListening || isAISpeaking)
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
                {isConnecting ? (
                    <span>Connecting...</span>
                ) : isAISpeaking ? (
                    <span className="text-blue-500 animate-pulse">Veenoe is speaking...</span>
                ) : isListening ? (
                    <span className="text-pumpkin animate-pulse">Listening...</span>
                ) : (
                    <span>Connecting...</span>
                )}
            </div>
        </div>
    );
}
