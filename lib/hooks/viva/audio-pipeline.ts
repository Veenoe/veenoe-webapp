/** Coordinates playback completion with conversation state and session conclusion. */
import { ConversationState, MicrophoneState, PlaybackState } from "@/types/viva";
import type { AudioPlayerCallbacks } from "@/lib/gemini/audio-player";

export interface AudioPipelineDependencies {
    setConversationState: (state: ConversationState) => void;
    setPlaybackState: (state: PlaybackState) => void;
    isConclusionPendingRef: React.MutableRefObject<boolean>;
    isTurnCompleteRef: React.MutableRefObject<boolean>;
    isAudioPlayingRef: React.MutableRefObject<boolean>;
    finishConclusion: () => void;
}

export function shouldForwardMicrophoneAudio(state: MicrophoneState): boolean {
    return state === MicrophoneState.ACTIVE;
}

export function createAudioPipeline(deps: AudioPipelineDependencies) {
    const {
        setConversationState,
        setPlaybackState,
        isConclusionPendingRef,
        isTurnCompleteRef,
        isAudioPlayingRef,
        finishConclusion,
    } = deps;

    const createPlaybackCallbacks = (extraCallbacks?: Partial<AudioPlayerCallbacks>): AudioPlayerCallbacks => ({
        onPlayStart: () => {
            isAudioPlayingRef.current = true;
            setPlaybackState(PlaybackState.PLAYING);
            setConversationState(ConversationState.SPEAKING);
            extraCallbacks?.onPlayStart?.();
        },
        onPlayEnd: () => {
            isAudioPlayingRef.current = false;
            setPlaybackState(PlaybackState.IDLE);
            extraCallbacks?.onPlayEnd?.();
            if (isConclusionPendingRef.current) {
                finishConclusion();
            } else if (isTurnCompleteRef.current) {
                setConversationState(ConversationState.LISTENING);
            } else {
                setConversationState(ConversationState.THINKING);
            }
        },
        onAudioScheduled: (queueDurationMs) => {
            extraCallbacks?.onAudioScheduled?.(queueDurationMs);
        },
        onUnderrun: () => extraCallbacks?.onUnderrun?.(),
    });

    const interruptPlayback = (
        stop: () => void,
        signalReceived: () => void,
        playbackStopped: () => void
    ) => {
        signalReceived();
        stop();
        playbackStopped();
        isAudioPlayingRef.current = false;
        isTurnCompleteRef.current = true;
        setPlaybackState(PlaybackState.IDLE);
        setConversationState(ConversationState.LISTENING);
    };

    return { createPlaybackCallbacks, interruptPlayback };
}
