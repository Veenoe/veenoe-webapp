import assert from 'node:assert/strict';
import test from 'node:test';
import {
  Live,
  Modality,
  type LiveCallbacks,
  type Session,
} from '@google/genai';

import {
  createGeminiClientContent,
  createGeminiLiveConfig,
  GEMINI_LIVE_API_VERSION,
  GEMINI_LIVE_MODEL,
  GeminiLiveClientSDK,
} from '../lib/gemini/live-client-sdk';
import { processGeminiMessage } from '../lib/gemini/message-processor';

test('selects the current Live model and ephemeral-token API version', () => {
  assert.equal(GEMINI_LIVE_MODEL, 'gemini-3.8-live');
  assert.equal(/preview|gemini-2\.5/.test(GEMINI_LIVE_MODEL), false);
  assert.equal(GEMINI_LIVE_API_VERSION, 'v1beta');
});

test('audio send only counts calls accepted by an open SDK transport', () => {
  let errors = 0;
  const client = new GeminiLiveClientSDK('auth_tokens/test', {
    onError: () => {
      errors++;
    },
  });
  const internal = client as unknown as {
    session: { sendRealtimeInput: (value: unknown) => void };
    transportOpen: boolean;
  };
  let calls = 0;
  internal.session = {
    sendRealtimeInput: () => {
      calls++;
    },
  };
  internal.transportOpen = false;
  assert.equal(client.sendAudio(new ArrayBuffer(640)), false);
  assert.equal(calls, 0);
  internal.transportOpen = true;
  assert.equal(client.sendAudio(new ArrayBuffer(640)), true);
  assert.equal(calls, 1);
  internal.session.sendRealtimeInput = () => {
    throw new Error('socket closed');
  };
  let synchronousFailures = 0;
  assert.equal(
    client.sendAudio(new ArrayBuffer(640), () => {
      synchronousFailures++;
    }),
    false,
  );
  assert.equal(synchronousFailures, 1);
  assert.equal(errors, 1);
  assert.equal(internal.transportOpen, false);
});

test('text send and connection state both require an open transport', () => {
  let errors = 0;
  const client = new GeminiLiveClientSDK('auth_tokens/test', {
    onError: () => {
      errors++;
    },
  });
  const internal = client as unknown as {
    session: { sendClientContent: (value: unknown) => void } | null;
    transportOpen: boolean;
  };
  let calls = 0;
  internal.session = {
    sendClientContent: () => {
      calls++;
    },
  };
  internal.transportOpen = false;
  assert.equal(client.sendText('conclude'), false);
  assert.equal(calls, 0);
  assert.equal(client.getConnectionState(), 'disconnected');

  internal.transportOpen = true;
  assert.equal(client.sendText('conclude'), true);
  assert.equal(calls, 1);
  assert.equal(client.getConnectionState(), 'connected');

  internal.session.sendClientContent = () => {
    throw new Error('socket closed');
  };
  assert.equal(client.sendText('conclude'), false);
  assert.equal(errors, 1);
  assert.equal(internal.transportOpen, false);
  assert.equal(client.getConnectionState(), 'disconnected');

  internal.session = null;
  internal.transportOpen = true;
  assert.equal(client.sendText('conclude'), false);
  assert.equal(client.getConnectionState(), 'disconnected');
});

test('disconnect during Live setup closes a late session and ignores stale callbacks', async () => {
  const originalConnect = Live.prototype.connect;
  let callbacks: LiveCallbacks | null = null;
  let resolveSession!: (session: Session) => void;
  const pending = new Promise<Session>((resolve) => {
    resolveSession = resolve;
  });
  Live.prototype.connect = async (params) => {
    callbacks = params.callbacks;
    return pending;
  };
  let connected = 0;
  let errors = 0;
  let disconnected = 0;
  let closed = 0;
  try {
    const client = new GeminiLiveClientSDK('auth_tokens/test', {
      onConnected: () => {
        connected++;
      },
      onError: () => {
        errors++;
      },
      onDisconnected: () => {
        disconnected++;
      },
    });
    const connecting = client.connect();
    callbacks!.onopen?.();
    assert.equal(connected, 1);
    client.disconnect();
    callbacks!.onopen?.();
    callbacks!.onerror?.({} as ErrorEvent);
    callbacks!.onclose?.({} as CloseEvent);
    resolveSession({
      close: () => {
        closed++;
      },
    } as Session);
    await connecting;
    assert.deepEqual([connected, errors, disconnected, closed], [1, 0, 0, 1]);
    assert.equal(client.getConnectionState(), 'disconnected');
  } finally {
    Live.prototype.connect = originalConnect;
  }
});

test('disconnect during retry delay prevents another Live connection', async () => {
  const originalConnect = Live.prototype.connect;
  let attempts = 0;
  Live.prototype.connect = async () => {
    attempts++;
    throw new Error('connect failed');
  };
  let releaseDelay!: () => void;
  let retries = 0;
  let errors = 0;
  try {
    const client = new GeminiLiveClientSDK('auth_tokens/test', {
      onReconnectAttempt: () => {
        retries++;
      },
      onError: () => {
        errors++;
      },
    });
    (client as unknown as { delay: () => Promise<void> }).delay = () =>
      new Promise((resolve) => {
        releaseDelay = resolve;
      });
    const connecting = client.connect();
    await new Promise((resolve) => setImmediate(resolve));
    assert.deepEqual([attempts, retries], [1, 1]);
    client.disconnect();
    releaseDelay();
    await connecting;
    assert.deepEqual([attempts, retries, errors], [1, 1, 0]);
  } finally {
    Live.prototype.connect = originalConnect;
  }
});

test('uses audio response without duplicating backend VAD or voice', () => {
  const config = createGeminiLiveConfig();
  assert.equal(config.realtimeInputConfig, undefined);
  assert.equal(config.speechConfig, undefined);
  assert.deepEqual(config, {
    responseModalities: [Modality.AUDIO],
  });
});

test('sends the end-viva prompt as a completed user text turn', () => {
  assert.deepEqual(createGeminiClientContent('Please conclude the viva.'), {
    turns: [{ role: 'user', parts: [{ text: 'Please conclude the viva.' }] }],
    turnComplete: true,
  });
});

test('normalizes conclude_viva calls for the existing local handler', () => {
  const args = { score: 8, summary: 'Good work', strong_points: ['Reasoning'] };
  assert.deepEqual(
    processGeminiMessage({
      toolCall: {
        functionCalls: [{ id: 'call-1', name: 'conclude_viva', args }],
      },
    }),
    [{ type: 'tool_call', id: 'call-1', name: 'conclude_viva', args }],
  );
});
