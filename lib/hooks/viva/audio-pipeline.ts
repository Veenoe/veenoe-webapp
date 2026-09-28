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

export function createAudioPipeline(deps: AudioPipelineDependencies) {
    const {
        setConversationState,
        setPlaybackState,
        isConclusionPendingRef,
        isTurnCompleteRef,
        isAudioPlayingRef,
        finishConclusion,
    } = deps;
    let interruptedResponse = false;

    const forwardMicrophoneAudio = (
        data: ArrayBuffer,
        microphoneState: MicrophoneState,
        isMuted: boolean,
        sendAudio: (data: ArrayBuffer) => boolean,
        onPacketSent: (byteLength: number) => void,
        onPacketRejected: () => void
    ) => {
        if (microphoneState !== MicrophoneState.ACTIVE || isMuted) return;
        if (sendAudio(data)) onPacketSent(data.byteLength);
        else onPacketRejected();
    };

    const receiveGeminiAudio = async (
        audio: string,
        playAudio: (audio: string) => Promise<void>,
        onAudioReceived: () => void
    ) => {
        if (interruptedResponse) return;
        onAudioReceived();
        isTurnCompleteRef.current = false;
        setConversationState(ConversationState.SPEAKING);
        await playAudio(audio);
    };

    const completeTurn = (onTurnComplete: () => void) => {
        if (!interruptedResponse) onTurnComplete();
        interruptedResponse = false;
        isTurnCompleteRef.current = true;
        if (!isAudioPlayingRef.current && !isConclusionPendingRef.current) {
            setConversationState(ConversationState.LISTENING);
        }
    };

    const reset = () => {
        interruptedResponse = false;
        isAudioPlayingRef.current = false;
        isTurnCompleteRef.current = true;
    };

    const notifyDiagnostic = (callback: (() => void) | undefined) => {
        try { callback?.(); }
        catch (error) { console.error('[AudioPipeline] Diagnostic observer failed', error); }
    };

    const createPlaybackCallbacks = (extraCallbacks?: Partial<AudioPlayerCallbacks>): AudioPlayerCallbacks => ({
        onPlayStart: () => {
            isAudioPlayingRef.current = true;
            setPlaybackState(PlaybackState.PLAYING);
            setConversationState(ConversationState.SPEAKING);
            notifyDiagnostic(extraCallbacks?.onPlayStart);
        },
        onPlayEnd: () => {
            isAudioPlayingRef.current = false;
            setPlaybackState(PlaybackState.IDLE);
            notifyDiagnostic(extraCallbacks?.onPlayEnd);
            if (isConclusionPendingRef.current) {
                finishConclusion();
            } else if (isTurnCompleteRef.current) {
                setConversationState(ConversationState.LISTENING);
            } else {
                setConversationState(ConversationState.THINKING);
            }
        },
        onAudioScheduled: (queueDurationMs) => {
            notifyDiagnostic(() => extraCallbacks?.onAudioScheduled?.(queueDurationMs));
        },
        onUnderrun: () => notifyDiagnostic(extraCallbacks?.onUnderrun),
        onPlaybackError: () => extraCallbacks?.onPlaybackError?.(),
        onBufferEvent: (event) => notifyDiagnostic(() => extraCallbacks?.onBufferEvent?.(event)),
    });

    const interruptPlayback = (
        stop: () => void,
        signalReceived: () => void,
        playbackStopped: () => void,
        noPlaybackToStop: () => void
    ) => {
        interruptedResponse = true;
        const hadPlayback = isAudioPlayingRef.current;
        signalReceived();
        stop();
        if (hadPlayback) playbackStopped();
        else noPlaybackToStop();
        isAudioPlayingRef.current = false;
        isTurnCompleteRef.current = true;
        setPlaybackState(PlaybackState.IDLE);
        setConversationState(ConversationState.LISTENING);
        if (isConclusionPendingRef.current) finishConclusion();
    };

    return {
        forwardMicrophoneAudio,
        receiveGeminiAudio,
        completeTurn,
        reset,
        createPlaybackCallbacks,
        interruptPlayback,
    };
}
