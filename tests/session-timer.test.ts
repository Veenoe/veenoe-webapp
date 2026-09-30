import assert from 'node:assert/strict';
import test from 'node:test';
import { advanceSessionTimer } from '../lib/hooks/useSessionTimer';
import { useVivaStore } from '../lib/store/viva-store';
import { SessionState } from '../types/viva';

test('time limit requests the existing conclusion once instead of only changing UI state', () => {
    useVivaStore.getState().resetSession();
    useVivaStore.setState({ sessionState: SessionState.ACTIVE, timeRemaining: 2 });
    let requests = 0;
    const requestConclusion = () => {
        requests++;
        useVivaStore.getState().setSessionState(SessionState.CONCLUDING);
    };
    try {
        advanceSessionTimer(requestConclusion);
        assert.equal(requests, 0);
        assert.equal(useVivaStore.getState().timeRemaining, 1);
        advanceSessionTimer(requestConclusion);
        assert.equal(requests, 1);
        assert.equal(useVivaStore.getState().timeRemaining, 0);
        advanceSessionTimer(requestConclusion);
        assert.equal(requests, 1);
    } finally {
        useVivaStore.getState().resetSession();
    }
});

test('timer cannot request a report after completion or outside an active session', () => {
    useVivaStore.getState().resetSession();
    try {
        for (const sessionState of [SessionState.COMPLETED, SessionState.CONCLUDING, SessionState.ERROR, SessionState.PAUSED, SessionState.IDLE]) {
            useVivaStore.setState({ sessionState, timeRemaining: 0 });
            advanceSessionTimer(() => assert.fail('Inactive sessions cannot request conclusion'));
        }
    } finally {
        useVivaStore.getState().resetSession();
    }
});
