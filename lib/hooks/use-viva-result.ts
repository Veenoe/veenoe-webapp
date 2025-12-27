"use client";

import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@clerk/nextjs";
import { getVivaSession, setAuthToken } from "@/lib/api/axios";
import { VivaSession } from "@/types/viva";

/**
 * Hook to fetch a specific viva session result.
 * Automatically injects auth token before making the API call.
 */
export function useVivaResult(sessionId: string) {
    const { getToken } = useAuth();

    return useQuery<VivaSession>({
        queryKey: ["viva-session", sessionId],
        queryFn: async () => {
            // Inject auth token before API call
            const token = await getToken();
            setAuthToken(token);

            return getVivaSession(sessionId);
        },
        enabled: !!sessionId,
        staleTime: 1000 * 60 * 60, // 1 hour
        retry: 2,
    });
}