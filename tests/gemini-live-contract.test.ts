import assert from 'node:assert/strict';
import test from 'node:test';
import { MediaResolution, Modality } from '@google/genai';

import {
  createGeminiClientContent,
  createGeminiLiveConfig,
  GEMINI_LIVE_API_VERSION,
  GEMINI_LIVE_MODEL,
} from '../lib/gemini/live-client-sdk';
import { processGeminiMessage } from '../lib/gemini/message-processor';

test('selects the current Live model and ephemeral-token API version', () => {
  assert.equal(GEMINI_LIVE_MODEL, 'gemini-3.8-live');
  assert.equal(/preview|gemini-2\.5/.test(GEMINI_LIVE_MODEL), false);
  assert.equal(GEMINI_LIVE_API_VERSION, 'v1beta');
});

test('uses the supported audio response, media resolution, and voice configuration', () => {
  assert.deepEqual(createGeminiLiveConfig(), {
    responseModalities: [Modality.AUDIO],
    mediaResolution: MediaResolution.MEDIA_RESOLUTION_MEDIUM,
    speechConfig: {
      voiceConfig: {
        prebuiltVoiceConfig: { voiceName: 'Puck' },
      },
    },
  });
});

test('sends the end-viva prompt as a completed user text turn', () => {
  assert.deepEqual(
    createGeminiClientContent('Please conclude the viva.'),
    {
      turns: [{ role: 'user', parts: [{ text: 'Please conclude the viva.' }] }],
      turnComplete: true,
    },
  );
});

test('normalizes conclude_viva calls for the existing local handler', () => {
  const args = { score: 8, summary: 'Good work', strong_points: ['Reasoning'] };
  assert.deepEqual(
    processGeminiMessage({
      toolCall: { functionCalls: [{ name: 'conclude_viva', args }] },
    }),
    [{ type: 'tool_call', payload: { name: 'conclude_viva', args } }],
  );
});
