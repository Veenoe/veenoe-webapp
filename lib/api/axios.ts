import axios, { AxiosError } from 'axios';
import type {
    VivaStartRequest,
    VivaStartResponse,
    ConcludeVivaRequest,
    ConcludeVivaResponse,
    VivaSession,
} from "@/types/viva";

const baseURL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000';

const api = axios.create({
    baseURL,
    headers: {
        'Content-Type': 'application/json',
    },
});

// Request interceptor to add auth token
api.interceptors.request.use(
    async (config) => {
        return config;
    },
    (error) => {
        return Promise.reject(error);
    }
);

// Response interceptor for error handling
api.interceptors.response.use(
    (response) => {
        return response;
    },
    (error) => {
        return Promise.reject(error);
    }
);

// --- Custom Error Class ---

export class APIError extends Error {
    constructor(message: string, public status?: number, public data?: unknown) {
        super(message);
        this.name = "APIError";
    }
}

// Helper to extract error message from axios errors
function handleAxiosError(error: unknown): never {
    if (error instanceof AxiosError) {
        const message = error.response?.data?.detail || error.message || "Network error";
        throw new APIError(message, error.response?.status, error.response?.data);
    }
    throw new APIError(error instanceof Error ? error.message : "Unknown error");
}

// --- Session Management ---

export async function startVivaSession(request: VivaStartRequest): Promise<VivaStartResponse> {
    try {
        const response = await api.post<VivaStartResponse>("/api/v1/viva/start", request);
        return response.data;
    } catch (error) {
        handleAxiosError(error);
    }
}

export async function concludeViva(request: ConcludeVivaRequest): Promise<ConcludeVivaResponse> {
    try {
        const response = await api.post<ConcludeVivaResponse>("/api/v1/viva/conclude-viva", request);
        return response.data;
    } catch (error) {
        handleAxiosError(error);
    }
}

// --- Data Fetching ---

export async function getVivaSession(sessionId: string): Promise<VivaSession> {
    try {
        const response = await api.get<VivaSession>(`/api/v1/viva/${sessionId}`);
        return response.data;
    } catch (error) {
        handleAxiosError(error);
    }
}

export default api;

