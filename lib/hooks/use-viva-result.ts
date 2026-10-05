'use client';

import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@clerk/nextjs';
import { getVivaSession, setAuthToken } from '@/lib/api/axios';
import { VivaSession } from '@/types/viva';

/**
 * Hook to fetch a specific viva session result.
 * Automatically injects auth token before making the API call.
 */
export function useVivaResult(sessionId: string) {
    const { getToken, isLoaded, userId } = useAuth();

    return useQuery<VivaSession>({
        // A result URL may survive account switching; private cache entries must
        // be scoped to the authenticated owner as well as the session ID.
        queryKey: ['viva-session', userId, sessionId],
        queryFn: async () => {
            // Inject auth token before API call
            const token = await getToken();
            setAuthToken(token);

            return getVivaSession(sessionId);
        },
        enabled: isLoaded && !!userId && !!sessionId,
        staleTime: 1000 * 60 * 60, // 1 hour
        retry: 2,
    });
}
