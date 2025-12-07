import api from '@/lib/api/axios';
import { HistoryResponse } from '@/types/viva';

export const historyService = {
    getHistory: async (userId: string): Promise<HistoryResponse> => {
        const response = await api.get<HistoryResponse>(`/api/v1/viva/history/${userId}`);
        return response.data;
    },

    renameSession: async (sessionId: string, newTitle: string): Promise<void> => {
        await api.patch(`/api/v1/viva/${sessionId}/rename`, { new_title: newTitle });
    },

    deleteSession: async (sessionId: string): Promise<void> => {
        await api.delete(`/api/v1/viva/${sessionId}`);
    }
};
