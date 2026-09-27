import assert from 'node:assert/strict';
import test from 'node:test';
import { createAudioPipeline } from '../lib/hooks/viva/audio-pipeline';
import { ConversationState, MicrophoneState, PlaybackState } from '../types/viva';
import { processGeminiMessage } from '../lib/gemini/message-processor';
import { useVivaStore } from '../lib/store/viva-store';

function setup() {
  useVivaStore.getState().resetSession();
  const playing = { current: false };
  const turnComplete = { current: false };
  let concluded = false;
  const pipeline = createAudioPipeline({
    setConversationState: state => useVivaStore.getState().setConversationState(state),
    setPlaybackState: state => useVivaStore.getState().setPlaybackState(state),
    isConclusionPendingRef: { current: false },
    isTurnCompleteRef: turnComplete,
    isAudioPlayingRef: playing,
    finishConclusion: () => { concluded = true; },
  });
  return { pipeline, playing, turnComplete, concluded: () => concluded };
}

test('the production forwarding path sends mic packets throughout playback, except while muted', () => {
  const { pipeline } = setup();
  const sent: ArrayBuffer[] = [];
  const measured: number[] = [];
  const packet = new ArrayBuffer(256);
  const forward = () => {
    const { microphoneState, isMuted } = useVivaStore.getState();
    pipeline.forwardMicrophoneAudio(packet, microphoneState, isMuted,
      data => { sent.push(data); return true; }, bytes => { measured.push(bytes); });
  };

  useVivaStore.getState().setMicrophoneState(MicrophoneState.ACTIVE);
  const playback = pipeline.createPlaybackCallbacks();
  playback.onPlayStart?.();
  assert.equal(useVivaStore.getState().playbackState, PlaybackState.PLAYING);
  forward();
  assert.equal(sent.length, 1);

  useVivaStore.getState().toggleMute();
  forward();
  assert.equal(sent.length, 1);
  assert.equal(useVivaStore.getState().playbackState, PlaybackState.PLAYING);

  useVivaStore.getState().toggleMute();
  forward();
  assert.equal(sent.length, 2);
  assert.deepEqual(measured, [256, 256]);
  useVivaStore.getState().resetSession();
});

test('mute never turns an idle or failed recorder into an active microphone', () => {
  useVivaStore.getState().resetSession();
  useVivaStore.getState().toggleMute();
  useVivaStore.getState().toggleMute();
  assert.equal(useVivaStore.getState().microphoneState, MicrophoneState.IDLE);
  assert.equal(useVivaStore.getState().isMuted, false);
  useVivaStore.getState().resetSession();
});

test('interruption stops playback immediately, ignores stale audio, then accepts the next response', async () => {
  const { pipeline, playing } = setup();
  const events: string[] = [];
  const playback = pipeline.createPlaybackCallbacks();
  const play = async (audio: string) => {
    events.push(`play:${audio}`);
    playback.onPlayStart?.();
  };
  const received = () => events.push('received');

  await pipeline.receiveGeminiAudio('first', play, received);
  assert.equal(playing.current, true);
  pipeline.interruptPlayback(
    () => events.push('stop'),
    () => events.push('signal'),
    () => events.push('playback-stopped'),
    () => events.push('no-playback'),
  );
  assert.deepEqual(events.slice(-3), ['signal', 'stop', 'playback-stopped']);
  assert.equal(useVivaStore.getState().conversationState, ConversationState.LISTENING);
  assert.equal(useVivaStore.getState().playbackState, PlaybackState.IDLE);

  await pipeline.receiveGeminiAudio('stale', play, received);
  assert.equal(events.includes('play:stale'), false);
  pipeline.completeTurn(() => events.push('normal-turn-complete'));
  assert.equal(events.includes('normal-turn-complete'), false);
  await pipeline.receiveGeminiAudio('next', play, received);
  assert.equal(events.at(-1), 'play:next');
  assert.equal(useVivaStore.getState().playbackState, PlaybackState.PLAYING);
  pipeline.reset();
  assert.equal(playing.current, false);
  useVivaStore.getState().resetSession();
});

test('interruption without queued playback does not record a playback stop', () => {
  const { pipeline } = setup();
  const events: string[] = [];
  pipeline.interruptPlayback(
    () => events.push('stop'),
    () => events.push('signal'),
    () => events.push('playback-stopped'),
    () => events.push('no-playback'),
  );
  assert.deepEqual(events, ['signal', 'stop', 'no-playback']);
});

test('normal playback ends into listening once turn completes', () => {
  const { pipeline, turnComplete } = setup();
  const callbacks = pipeline.createPlaybackCallbacks();
  callbacks.onPlayStart?.();
  turnComplete.current = true;
  callbacks.onPlayEnd?.();
  assert.equal(useVivaStore.getState().conversationState, ConversationState.LISTENING);
  assert.equal(useVivaStore.getState().playbackState, PlaybackState.IDLE);
});

test('interrupted Gemini message does not dispatch stale audio from the same response', () => {
  assert.deepEqual(processGeminiMessage({
    serverContent: {
      interrupted: true,
      modelTurn: { parts: [{ inlineData: { data: 'stale' } }] },
    }
  }), [{ type: 'interrupted', payload: null }]);
});
