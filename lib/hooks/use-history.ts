import { useQuery } from '@tanstack/react-query';
import { useUser } from '@clerk/nextjs';
import api from '@/lib/api/axios';

export interface VivaSessionSummary {
    viva_session_id: string;
    title: string;
    topic: string;
    class_level: number;
    started_at: string;
    session_type: string;
    status: string;
}

export interface HistoryResponse {
    sessions: VivaSessionSummary[];
}

export function useHistory() {
    const { user } = useUser();

    return useQuery({
        queryKey: ['history', user?.id],
        queryFn: async () => {
            if (!user?.id) return { sessions: [] };
            const response = await api.get<HistoryResponse>(`/api/v1/viva/history/${user.id}`);
            return response.data;
        },
        enabled: !!user?.id,
    });
}
