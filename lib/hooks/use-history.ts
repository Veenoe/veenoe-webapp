import {
    useInfiniteQuery,
    useMutation,
    useQueryClient,
    type InfiniteData,
} from '@tanstack/react-query';
import { useUser, useAuth } from '@clerk/nextjs';
import { historyService } from '@/lib/api/history';
import { setAuthToken, APIError } from '@/lib/api/axios';
import { VivaSessionSummary, HistoryResponse } from '@/types/viva';
import { toast } from 'sonner';

export type { VivaSessionSummary, HistoryResponse };

/**
 * Get user-friendly error message based on API error status
 */
function getErrorMessage(err: unknown, action: 'rename' | 'delete'): string {
    if (err instanceof APIError) {
        switch (err.status) {
            case 401:
                return 'Please sign in to continue';
            case 403:
                return `You don't have permission to ${action} this session`;
            case 404:
                return 'Session not found';
            default:
                return err.message || `Failed to ${action} session`;
        }
    }
    return `Failed to ${action} session`;
}

/**
 * Hook to fetch the authenticated user's viva history.
 *
 * Automatically injects the Clerk auth token before making API calls.
 * The server identifies the user from the JWT - no user_id needed.
 */
export function useHistory() {
    const { user } = useUser();
    const { getToken } = useAuth();

    return useInfiniteQuery({
        queryKey: ['history', user?.id],
        initialPageParam: undefined as string | undefined,
        queryFn: async ({ pageParam }) => {
            // Inject auth token before API call
            const token = await getToken();
            setAuthToken(token);

            return historyService.getHistory(pageParam);
        },
        getNextPageParam: (lastPage) => lastPage.next_cursor ?? undefined,
        // Flatten only the view; retain pages and cursors for pagination/rollback.
        select: (data) => ({
            ...data,
            sessions: data.pages.flatMap((page) => page.sessions),
        }),
        enabled: !!user?.id,
        staleTime: 1000 * 60 * 5, // 5 minutes
    });
}

export function useRenameSession() {
    const queryClient = useQueryClient();
    const { user } = useUser();
    const { getToken } = useAuth();

    return useMutation({
        mutationFn: async ({
            sessionId,
            newTitle,
        }: {
            sessionId: string;
            newTitle: string;
        }) => {
            // Inject auth token before API call
            const token = await getToken();
            setAuthToken(token);

            return historyService.renameSession(sessionId, newTitle);
        },

        onMutate: async ({ sessionId, newTitle }) => {
            await queryClient.cancelQueries({
                queryKey: ['history', user?.id],
            });
            const previousHistory = queryClient.getQueryData<
                InfiniteData<HistoryResponse>
            >(['history', user?.id]);

            // Snapshot every loaded page so rollback preserves older sessions and
            // cursors, even when the edited session is outside the newest page.

            queryClient.setQueryData<InfiniteData<HistoryResponse>>(
                ['history', user?.id],
                (old) => {
                    if (!old) return old;
                    return {
                        ...old,
                        pages: old.pages.map((page) => ({
                            ...page,
                            sessions: page.sessions.map((session) =>
                                session.viva_session_id === sessionId
                                    ? { ...session, title: newTitle }
                                    : session,
                            ),
                        })),
                    };
                },
            );

            return { previousHistory };
        },

        onError: (err, _variables, context) => {
            if (context?.previousHistory) {
                queryClient.setQueryData(
                    ['history', user?.id],
                    context.previousHistory,
                );
            }
            toast.error(getErrorMessage(err, 'rename'));
        },

        onSettled: () => {
            queryClient.invalidateQueries({ queryKey: ['history', user?.id] });
        },
    });
}

export function useDeleteSession() {
    // Preserve page boundaries/cursors during optimistic removal; invalidation
    // subsequently refreshes server order and fills any resulting page gaps.
    const queryClient = useQueryClient();
    const { user } = useUser();
    const { getToken } = useAuth();

    return useMutation({
        mutationFn: async (sessionId: string) => {
            // Inject auth token before API call
            const token = await getToken();
            setAuthToken(token);

            return historyService.deleteSession(sessionId);
        },

        onMutate: async (sessionId) => {
            await queryClient.cancelQueries({
                queryKey: ['history', user?.id],
            });
            const previousHistory = queryClient.getQueryData<
                InfiniteData<HistoryResponse>
            >(['history', user?.id]);

            queryClient.setQueryData<InfiniteData<HistoryResponse>>(
                ['history', user?.id],
                (old) => {
                    if (!old) return old;
                    return {
                        ...old,
                        pages: old.pages.map((page) => ({
                            ...page,
                            sessions: page.sessions.filter(
                                (session) =>
                                    session.viva_session_id !== sessionId,
                            ),
                        })),
                    };
                },
            );

            return { previousHistory };
        },

        onError: (err, _sessionId, context) => {
            if (context?.previousHistory) {
                queryClient.setQueryData(
                    ['history', user?.id],
                    context.previousHistory,
                );
            }
            toast.error(getErrorMessage(err, 'delete'));
        },

        onSettled: () => {
            queryClient.invalidateQueries({ queryKey: ['history', user?.id] });
        },
    });
}
