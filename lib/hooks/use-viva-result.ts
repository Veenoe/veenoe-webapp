"use client";

import { useQuery } from "@tanstack/react-query";
import { getVivaSession } from "@/lib/api/axios";
import { VivaSession } from "@/types/viva";

export function useVivaResult(sessionId: string) {
    return useQuery<VivaSession>({
        queryKey: ["viva-session", sessionId],
        queryFn: () => getVivaSession(sessionId),
        enabled: !!sessionId, // Only run if ID is present
        staleTime: 1000 * 60 * 60, // Data is considered fresh for 1 hour (since it's a past report)
        retry: 2,
    });
}