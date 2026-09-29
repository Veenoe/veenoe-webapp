import assert from 'node:assert/strict';
import test from 'node:test';
import { createToolHandler } from '../lib/hooks/viva/tool-handlers';
import { createAudioPipeline } from '../lib/hooks/viva/audio-pipeline';
import { useVivaStore } from '../lib/store/viva-store';

test('repeated Gemini conclusion calls save once per session', async () => {
  useVivaStore.getState().resetSession();
  useVivaStore.setState({ sessionId: 'session-one' });
  let writes = 0;
  const handler = createToolHandler({
    setError: () => {}, finishConclusion: () => {},
    hasPendingPlayback: () => true,
    isConclusionPendingRef: { current: false },
    getToken: async () => null,
    saveConclusion: async () => {
      writes++;
      return { status: 'completed', score: 2, final_feedback: 'done' };
    },
  });
  const args = { score: 2, summary: 'done', strong_points: [], areas_of_improvement: [] };
  try {
    await Promise.all([handler('conclude_viva', args), handler('conclude_viva', args)]);
    await handler('conclude_viva', args);
    assert.equal(writes, 1);
    useVivaStore.setState({ sessionId: 'session-two' });
    await handler('conclude_viva', args);
    assert.equal(writes, 2);
  } finally {
    useVivaStore.getState().resetSession();
  }
});

test('failed feedback save requests abandonment instead of reporting completion', async () => {
  useVivaStore.getState().resetSession();
  useVivaStore.setState({ sessionId: 'session-one' });
  let completed = 0;
  let abandoned = 0;
  const saving = { current: false };
  const handler = createToolHandler({
    setError: () => {},
    finishConclusion: () => {
      completed++;
    },
    hasPendingPlayback: () => false,
    isConclusionPendingRef: { current: false },
    isConclusionSavingRef: saving,
    getToken: async () => null,
    saveConclusion: async () => {
      throw new Error('offline');
    },
    abandonSession: async () => {
      abandoned++;
    },
  });
  try {
    await handler('conclude_viva', { score: 2 });
    assert.equal(completed, 0);
    assert.equal(abandoned, 1);
    assert.equal(saving.current, false);
  } finally {
    useVivaStore.getState().resetSession();
  }
});

test('saved conclusion waits for queued audio even before playback starts', async () => {
  useVivaStore.getState().resetSession();
  useVivaStore.setState({ sessionId: 'session-one' });
  const pending = { current: false };
  const playing = { current: false };
  let completed = 0;
  const finishConclusion = () => { completed++; };
  const pipeline = createAudioPipeline({
    setConversationState: () => {}, setPlaybackState: () => {},
    isConclusionPendingRef: pending, isTurnCompleteRef: { current: true },
    isAudioPlayingRef: playing, finishConclusion,
  });
  const handler = createToolHandler({
    setError: () => {}, finishConclusion,
    hasPendingPlayback: () => true,
    isConclusionPendingRef: pending,
    getToken: async () => null,
    saveConclusion: async () => ({ status: 'completed', score: 9, final_feedback: 'done' }),
  });
  try {
    await handler('conclude_viva', { score: 9 });
    assert.equal(pending.current, true);
    assert.equal(completed, 0);
    const playback = pipeline.createPlaybackCallbacks();
    playback.onPlayStart?.();
    playback.onPlayEnd?.();
    assert.equal(completed, 1);
  } finally {
    useVivaStore.getState().resetSession();
  }
});

test('throwing playback diagnostic does not prevent final conclusion', () => {
  const pending = { current: true };
  let finishes = 0;
  const pipeline = createAudioPipeline({
    setConversationState: () => {}, setPlaybackState: () => {},
    isConclusionPendingRef: pending, isTurnCompleteRef: { current: true },
    isAudioPlayingRef: { current: true }, finishConclusion: () => { finishes++; },
  });
  const oldError = console.error;
  console.error = () => {};
  try {
    const callbacks = pipeline.createPlaybackCallbacks({
      onPlayEnd: () => { throw new Error('diagnostics'); },
    });
    callbacks.onPlayEnd?.();
    assert.equal(finishes, 1);
  } finally { console.error = oldError; }
});
