import assert from 'node:assert/strict';
import { after, afterEach, before, test } from 'node:test';
import Module, { createRequire } from 'node:module';
import path from 'node:path';
import * as React from 'react';
import { JSDOM } from 'jsdom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const require = createRequire(path.resolve('tests/history-pagination.test.ts'));
const dom = new JSDOM('<!doctype html><html><body></body></html>', {
    url: 'http://localhost',
});
const calls: (string | undefined)[] = [];
const pages = [
    {
        sessions: [{ viva_session_id: 'recent', title: 'Recent' }],
        next_cursor: 'recent',
    },
    {
        sessions: [{ viva_session_id: 'older', title: 'Older' }],
        next_cursor: null,
    },
];
let ui: typeof import('@testing-library/react');
let hooks: typeof import('../lib/hooks/use-history');
let failRename = false;
let authenticatedUser: string | null = 'owner';
let useVivaResult: typeof import('../lib/hooks/use-viva-result').useVivaResult;

function stubModule(specifier: string, exports: unknown) {
    const filename = require.resolve(specifier);
    const stub = new Module(filename);
    stub.exports = exports;
    stub.loaded = true;
    require.cache[filename] = stub;
}

before(async () => {
    for (const name of [
        'window',
        'document',
        'navigator',
        'HTMLElement',
        'Element',
        'Node',
        'MutationObserver',
    ] as const) {
        Object.defineProperty(globalThis, name, {
            configurable: true,
            value: dom.window[name],
        });
    }
    stubModule('@clerk/nextjs', {
        useUser: () => ({ user: { id: 'owner' } }),
        useAuth: () => ({
            getToken: async () => 'test-token',
            isLoaded: true,
            userId: authenticatedUser,
        }),
    });
    stubModule('../lib/api/history', {
        historyService: {
            getHistory: async (cursor?: string) => {
                calls.push(cursor);
                return structuredClone(pages[cursor ? 1 : 0]);
            },
            renameSession: async () => {
                if (failRename) throw new Error('test failure');
            },
            deleteSession: async () => {},
        },
    });
    stubModule('../lib/api/axios', {
        setAuthToken: () => {},
        APIError: class extends Error {},
        getVivaSession: async (id: string) => ({
            viva_session_id: id,
            title: authenticatedUser,
        }),
    });
    stubModule('sonner', { toast: { error: () => {} } });
    ui = await import('@testing-library/react');
    hooks = require('../lib/hooks/use-history');
    useVivaResult = require('../lib/hooks/use-viva-result').useVivaResult;
});

afterEach(() => ui.cleanup());
after(() => dom.window.close());

test('history follows the cursor and mutation rollback retains every loaded page', async () => {
    const client = new QueryClient({
        defaultOptions: { queries: { retry: false, gcTime: 0 } },
    });
    const wrapper = ({ children }: { children: React.ReactNode }) =>
        React.createElement(QueryClientProvider, { client }, children);
    const { result } = ui.renderHook(
        () => ({
            history: hooks.useHistory(),
            rename: hooks.useRenameSession(),
        }),
        { wrapper },
    );
    await ui.waitFor(() =>
        assert.equal(result.current.history.isSuccess, true),
    );
    assert.deepEqual(calls, [undefined]);
    assert.equal(result.current.history.hasNextPage, true);
    await ui.act(async () => {
        await result.current.history.fetchNextPage();
    });
    await ui.waitFor(() =>
        assert.equal(result.current.history.data?.sessions.length, 2),
    );
    assert.deepEqual(calls, [undefined, 'recent']);
    assert.equal(result.current.history.hasNextPage, false);
    assert.deepEqual(
        result.current.history.data?.sessions.map((s) => s.viva_session_id),
        ['recent', 'older'],
    );

    failRename = true;
    await ui.act(async () => {
        await assert.rejects(
            result.current.rename.mutateAsync({
                sessionId: 'older',
                newTitle: 'Renamed',
            }),
        );
    });
    await ui.waitFor(() =>
        assert.equal(result.current.history.isFetching, false),
    );
    assert.deepEqual(
        result.current.history.data?.sessions.map((s) => s.title),
        ['Recent', 'Older'],
    );
    assert.equal(result.current.history.data?.pages.length, 2);
    client.clear();
});

test("private session results do not reuse another user's cached response", async () => {
    const client = new QueryClient({
        defaultOptions: { queries: { retry: false, gcTime: 0 } },
    });
    const wrapper = ({ children }: { children: React.ReactNode }) =>
        React.createElement(QueryClientProvider, { client }, children);
    authenticatedUser = 'first-owner';
    const { result, rerender } = ui.renderHook(
        () => useVivaResult('same-session'),
        { wrapper },
    );
    await ui.waitFor(() => assert.equal(result.current.isSuccess, true));
    assert.equal(
        client.getQueryData<{ title: string }>([
            'viva-session',
            'first-owner',
            'same-session',
        ])?.title,
        'first-owner',
    );
    authenticatedUser = 'second-owner';
    rerender();
    assert.equal(result.current.data, undefined);
    await ui.waitFor(() => assert.equal(result.current.isSuccess, true));
    assert.equal(
        client.getQueryData<{ title: string }>([
            'viva-session',
            'second-owner',
            'same-session',
        ])?.title,
        'second-owner',
    );
    authenticatedUser = null;
    rerender();
    assert.equal(result.current.data, undefined);
    assert.equal(result.current.fetchStatus, 'idle');
    client.clear();
});
