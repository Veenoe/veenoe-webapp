import api from '@/lib/api/axios';
import { HistoryResponse } from '@/types/viva';

/**
 * History service for managing viva session history.
 * 
 * Note: getHistory no longer requires userId - the server extracts
 * the user identity from the JWT token in the Authorization header.
 */
export const historyService = {
    /**
     * Get the authenticated user's viva history.
     * The server identifies the user from the JWT token.
     */
    getHistory: async (): Promise<HistoryResponse> => {
        const response = await api.get<HistoryResponse>('/api/v1/viva/history');
        return response.data;
    },

    /**
     * Rename a viva session.
     */
    renameSession: async (sessionId: string, newTitle: string): Promise<void> => {
        await api.patch(`/api/v1/viva/${sessionId}/rename`, { new_title: newTitle });
    },

    /**
     * Delete a viva session.
     */
    deleteSession: async (sessionId: string): Promise<void> => {
        await api.delete(`/api/v1/viva/${sessionId}`);
    }
};
