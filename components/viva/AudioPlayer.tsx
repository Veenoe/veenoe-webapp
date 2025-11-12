// veenoe-webapp/components/viva/AudioPlayer.tsx
"use client";

import React, { useEffect, useRef } from "react";
import { useVivaStore } from "@/lib/store/viva-store";

/**
 * A hidden component that manages HTMLAudioElement and MediaSource
 * for playing streaming TTS audio from the backend (now PCM).
 */
export function AudioPlayer() {
  const audioRef = useRef<HTMLAudioElement>(null);
  const initializePlayer = useVivaStore((state) => state.initializePlayer);

  useEffect(() => {
    if (audioRef.current) {
      initializePlayer(audioRef.current);
    }
  }, [initializePlayer]);

  return <audio ref={audioRef} autoPlay />;
}