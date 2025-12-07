import type {
    VivaStartRequest,
    VivaStartResponse,
    ConcludeVivaRequest,
    ConcludeVivaResponse,
    VivaSession,
} from "@/types/viva";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

export class APIError extends Error {
    constructor(message: string, public status?: number, public data?: unknown) {
        super(message);
        this.name = "APIError";
    }
}

async function fetchAPI<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const url = `${API_BASE_URL}${endpoint}`;
    
    // Ensure we handle JSON headers automatically
    const headers = {
        "Content-Type": "application/json",
        ...options.headers,
    } as HeadersInit;

    try {
        const response = await fetch(url, {
            ...options,
            headers,
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new APIError(
                errorData.detail || `HTTP ${response.status}: ${response.statusText}`,
                response.status,
                errorData
            );
        }

        return await response.json();
    } catch (error) {
        if (error instanceof APIError) throw error;
        throw new APIError(error instanceof Error ? error.message : "Network error");
    }
}

// --- Session Management ---

export async function startVivaSession(request: VivaStartRequest): Promise<VivaStartResponse> {
    return fetchAPI<VivaStartResponse>("/api/v1/viva/start", {
        method: "POST",
        body: JSON.stringify(request),
    });
}

// We removed getNextQuestion and evaluateResponse as per new architecture

export async function concludeViva(request: ConcludeVivaRequest): Promise<ConcludeVivaResponse> {
    return fetchAPI<ConcludeVivaResponse>("/api/v1/viva/conclude-viva", {
        method: "POST",
        body: JSON.stringify(request),
    });
}

// --- Data Fetching ---

export async function getVivaSession(sessionId: string): Promise<VivaSession> {
    // IMPORTANT: You must ensure your backend has a GET /api/v1/viva/{id} endpoint.
    // If it's not explicitly in `api.py` yet, it needs to be added to return the full session document.
    return fetchAPI<VivaSession>(`/api/v1/viva/${sessionId}`);
}