import assert from 'node:assert/strict';
import test from 'node:test';

import { useVivaStore } from '../lib/store/viva-store';
import { VoiceTelemetry } from '../lib/telemetry/voice-telemetry';

test('start response carries backend VAD profile to diagnostics without client policy values', () => {
  useVivaStore.getState().setSessionData({
    viva_session_id: 'test-session',
    ephemeral_token: 'test-token',
    google_model: 'gemini-3.8-live',
    session_duration_minutes: 5,
    voice_name: 'Kore',
    vad_profile: 'balanced-v1',
  });

  const { googleModel, vadProfile } = useVivaStore.getState();
  const telemetry = new VoiceTelemetry();
  telemetry.onSessionInitStart(googleModel ?? undefined, vadProfile ?? undefined);
  assert.equal(telemetry.getSnapshot().vadProfile, 'balanced-v1');

  useVivaStore.getState().resetSession();
  assert.equal(useVivaStore.getState().vadProfile, null);
});
