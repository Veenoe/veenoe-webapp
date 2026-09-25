/**
 * Audio Pipeline Controller for Viva Session
 * Manages audio recording state transitions - easily testable
 */

import { AudioState } from "@/types/viva";
import type { AudioPlayerCallbacks } from "@/lib/gemini/audio-player";

export interface AudioPipelineDependencies {
    setAudioState: (state: AudioState) => void;
    isConclusionPendingRef: React.MutableRefObject<boolean>;
    isTurnCompleteRef: React.MutableRefObject<boolean>;
    isAudioPlayingRef: React.MutableRefObject<boolean>;
    finishConclusion: () => void;
}

export interface AudioPipelineController {
    scheduleSwitchToRecording: () => void;
    cancelSwitchToRecording: () => void;
    createPlaybackCallbacks: (extraCallbacks?: Partial<AudioPlayerCallbacks>) => AudioPlayerCallbacks;
    cleanup: () => void;
}

/**
 * Creates an audio pipeline controller with the provided dependencies
 */
export function createAudioPipeline(deps: AudioPipelineDependencies): AudioPipelineController {
    const {
        setAudioState,
        isConclusionPendingRef,
        isTurnCompleteRef,
        isAudioPlayingRef,
        finishConclusion,
    } = deps;

    let recordingSwitchTimeout: NodeJS.Timeout | null = null;

    const cancelSwitchToRecording = () => {
        if (recordingSwitchTimeout) {
            clearTimeout(recordingSwitchTimeout);
            recordingSwitchTimeout = null;
        }
    };

    const scheduleSwitchToRecording = () => {
        cancelSwitchToRecording();

        // Only switch to recording if we aren't about to end
        if (isConclusionPendingRef.current) return;

        recordingSwitchTimeout = setTimeout(() => {
            setAudioState(AudioState.RECORDING);
            recordingSwitchTimeout = null;
        }, 500);
    };

    const createPlaybackCallbacks = (extraCallbacks?: Partial<AudioPlayerCallbacks>): AudioPlayerCallbacks => ({
        onPlayStart: () => {
            isAudioPlayingRef.current = true;
            setAudioState(AudioState.PLAYING);
            cancelSwitchToRecording();
            extraCallbacks?.onPlayStart?.();
        },
        onPlayEnd: () => {
            console.log("[AudioPipeline] Audio Playback Ended");
            isAudioPlayingRef.current = false;
            extraCallbacks?.onPlayEnd?.();

            // CRITICAL: Check if we were waiting to conclude
            if (isConclusionPendingRef.current) {
                finishConclusion();
                return;
            }

            // Otherwise, normal turn logic
            if (isTurnCompleteRef.current) {
                scheduleSwitchToRecording();
            }
        },
        onAudioScheduled: (queueDurationMs) => {
            extraCallbacks?.onAudioScheduled?.(queueDurationMs);
        },
        onUnderrun: () => {
            extraCallbacks?.onUnderrun?.();
        },
    });

    const cleanup = () => {
        cancelSwitchToRecording();
    };

    return {
        scheduleSwitchToRecording,
        cancelSwitchToRecording,
        createPlaybackCallbacks,
        cleanup,
    };
}
