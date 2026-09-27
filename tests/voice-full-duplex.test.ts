import assert from 'node:assert/strict';
import test from 'node:test';
import { createAudioPipeline, shouldForwardMicrophoneAudio } from '../lib/hooks/viva/audio-pipeline';
import { ConversationState, MicrophoneState, PlaybackState } from '../types/viva';
import { processGeminiMessage } from '../lib/gemini/message-processor';
import { useVivaStore } from '../lib/store/viva-store';

function setup() {
  let conversation = ConversationState.LISTENING;
  let playback = PlaybackState.IDLE;
  const playing = { current: false };
  const turnComplete = { current: false };
  let concluded = false;
  const pipeline = createAudioPipeline({
    setConversationState: state => { conversation = state; },
    setPlaybackState: state => { playback = state; },
    isConclusionPendingRef: { current: false },
    isTurnCompleteRef: turnComplete,
    isAudioPlayingRef: playing,
    finishConclusion: () => { concluded = true; },
  });
  return { pipeline, playing, turnComplete, state: () => ({ conversation, playback, concluded }) };
}

test('microphone forwarding remains active during playback and explicit mute blocks it', () => {
  const { pipeline, state } = setup();
  pipeline.createPlaybackCallbacks().onPlayStart?.();
  assert.equal(state().playback, PlaybackState.PLAYING);
  assert.equal(shouldForwardMicrophoneAudio(MicrophoneState.ACTIVE), true);
  assert.equal(shouldForwardMicrophoneAudio(MicrophoneState.MUTED), false);
  assert.equal(shouldForwardMicrophoneAudio(MicrophoneState.IDLE), false);
});

test('mute changes microphone availability without changing playback or conversation', () => {
  useVivaStore.getState().resetSession();
  useVivaStore.getState().setMicrophoneState(MicrophoneState.ACTIVE);
  useVivaStore.getState().setPlaybackState(PlaybackState.PLAYING);
  useVivaStore.getState().setConversationState(ConversationState.SPEAKING);
  useVivaStore.getState().toggleMute();
  assert.equal(useVivaStore.getState().microphoneState, MicrophoneState.MUTED);
  assert.equal(useVivaStore.getState().playbackState, PlaybackState.PLAYING);
  assert.equal(useVivaStore.getState().conversationState, ConversationState.SPEAKING);
  useVivaStore.getState().toggleMute();
  assert.equal(useVivaStore.getState().microphoneState, MicrophoneState.ACTIVE);
  useVivaStore.getState().resetSession();
});

test('interruption stops playback before recording latency and listens immediately', () => {
  const { pipeline, playing, state } = setup();
  pipeline.createPlaybackCallbacks().onPlayStart?.();
  const events: string[] = [];
  pipeline.interruptPlayback(
    () => { events.push('stop'); },
    () => { events.push('signal'); },
    () => { events.push('telemetry'); },
  );
  assert.deepEqual(events, ['signal', 'stop', 'telemetry']);
  assert.deepEqual(state(), {
    conversation: ConversationState.LISTENING,
    playback: PlaybackState.IDLE,
    concluded: false,
  });
  assert.equal(playing.current, false);
  assert.equal(shouldForwardMicrophoneAudio(MicrophoneState.ACTIVE), true);
});

test('normal playback ends into listening once turn completes', () => {
  const { pipeline, turnComplete, state } = setup();
  const callbacks = pipeline.createPlaybackCallbacks();
  callbacks.onPlayStart?.();
  turnComplete.current = true;
  callbacks.onPlayEnd?.();
  assert.equal(state().conversation, ConversationState.LISTENING);
  assert.equal(state().playback, PlaybackState.IDLE);
});

test('interrupted Gemini message does not dispatch stale audio from the same response', () => {
  assert.deepEqual(processGeminiMessage({ serverContent: {
    interrupted: true,
    modelTurn: { parts: [{ inlineData: { data: 'stale' } }] },
  } }), [{ type: 'interrupted', payload: null }]);
});
