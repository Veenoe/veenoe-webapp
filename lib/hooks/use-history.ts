import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
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

    return useQuery({
        queryKey: ['history', user?.id],
        queryFn: async () => {
            // Inject auth token before API call
            const token = await getToken();
            setAuthToken(token);

            return historyService.getHistory();
        },
        enabled: !!user?.id,
        staleTime: 1000 * 60 * 5, // 5 minutes
    });
}

export function useRenameSession() {
    const queryClient = useQueryClient();
    const { user } = useUser();
    const { getToken } = useAuth();

    return useMutation({
        mutationFn: async ({ sessionId, newTitle }: { sessionId: string; newTitle: string }) => {
            // Inject auth token before API call
            const token = await getToken();
            setAuthToken(token);

            return historyService.renameSession(sessionId, newTitle);
        },

        onMutate: async ({ sessionId, newTitle }) => {
            await queryClient.cancelQueries({ queryKey: ['history', user?.id] });
            const previousHistory = queryClient.getQueryData<HistoryResponse>(['history', user?.id]);

            queryClient.setQueryData<HistoryResponse>(['history', user?.id], (old) => {
                if (!old) return old;
                return {
                    ...old,
                    sessions: old.sessions.map((session) =>
                        session.viva_session_id === sessionId
                            ? { ...session, title: newTitle }
                            : session
                    ),
                };
            });

            return { previousHistory };
        },

        onError: (err, _variables, context) => {
            if (context?.previousHistory) {
                queryClient.setQueryData(['history', user?.id], context.previousHistory);
            }
            toast.error(getErrorMessage(err, 'rename'));
        },

        onSettled: () => {
            queryClient.invalidateQueries({ queryKey: ['history', user?.id] });
        },
    });
}

export function useDeleteSession() {
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
            await queryClient.cancelQueries({ queryKey: ['history', user?.id] });
            const previousHistory = queryClient.getQueryData<HistoryResponse>(['history', user?.id]);

            queryClient.setQueryData<HistoryResponse>(['history', user?.id], (old) => {
                if (!old) return old;
                return {
                    ...old,
                    sessions: old.sessions.filter((session) => session.viva_session_id !== sessionId),
                };
            });

            return { previousHistory };
        },

        onError: (err, _sessionId, context) => {
            if (context?.previousHistory) {
                queryClient.setQueryData(['history', user?.id], context.previousHistory);
            }
            toast.error(getErrorMessage(err, 'delete'));
        },

        onSettled: () => {
            queryClient.invalidateQueries({ queryKey: ['history', user?.id] });
        },
    });
}
