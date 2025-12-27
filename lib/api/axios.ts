import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';
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

// ---------------------------------------------------------------------------
// Token Getter Pattern (Thread-Safe Alternative to Global Mutable State)
// ---------------------------------------------------------------------------
// Instead of storing a mutable token that can be overwritten by concurrent
// requests, we store a function that fetches a fresh token per request.
// This eliminates race conditions in scenarios like:
// - Multiple browser tabs
// - Concurrent API calls
// - Token refresh during request

type TokenGetter = () => Promise<string | null>;
let tokenGetter: TokenGetter | null = null;

/**
 * Set the token getter function for all subsequent API requests.
 * This should be called once during app initialization with a function
 * that returns the current auth token (e.g., from Clerk).
 * 
 * @example
 * // In your app's root component or provider:
 * import { useAuth } from '@clerk/nextjs';
 * 
 * function AuthProvider({ children }) {
 *   const { getToken } = useAuth();
 *   
 *   useEffect(() => {
 *     setTokenGetter(getToken);
 *   }, [getToken]);
 *   
 *   return children;
 * }
 */
export function setTokenGetter(getter: TokenGetter): void {
    tokenGetter = getter;
}

/**
 * @deprecated Use setTokenGetter instead for race-condition-free auth.
 * This function is kept for backward compatibility during migration.
 */
export function setAuthToken(token: string | null): void {
    // Create a simple getter that returns the provided token
    // This maintains backward compatibility while encouraging migration
    if (token) {
        tokenGetter = async () => token;
    } else {
        tokenGetter = null;
    }
}

/**
 * Get the current auth token (for debugging/testing).
 * Returns a promise since token fetching may be async.
 */
export async function getAuthToken(): Promise<string | null> {
    if (!tokenGetter) return null;
    return await tokenGetter();
}

// Request interceptor to add auth token
api.interceptors.request.use(
    async (config: InternalAxiosRequestConfig) => {
        if (tokenGetter) {
            try {
                const token = await tokenGetter();
                if (token) {
                    config.headers.Authorization = `Bearer ${token}`;
                }
            } catch (error) {
                console.warn('Failed to get auth token:', error);
            }
        }
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
        // Handle 401 errors (token expired, etc.)
        if (error.response?.status === 401) {
            console.warn('API returned 401 - authentication required');
        }
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
