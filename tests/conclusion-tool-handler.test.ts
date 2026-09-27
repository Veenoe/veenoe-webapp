import assert from 'node:assert/strict';
import test from 'node:test';
import { createToolHandler } from '../lib/hooks/viva/tool-handlers';
import { useVivaStore } from '../lib/store/viva-store';

test('repeated Gemini conclusion calls save once per session', async () => {
  useVivaStore.getState().resetSession();
  useVivaStore.setState({ sessionId: 'session-one' });
  let writes = 0;
  const handler = createToolHandler({
    setError: () => {}, finishConclusion: () => {},
    isAudioPlayingRef: { current: true },
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
    isAudioPlayingRef: { current: false },
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
