/**
 * API Client for Viva Backend
 * Handles all HTTP requests to the FastAPI backend
 */

import type {
    VivaStartRequest,
    VivaStartResponse,
    GetNextQuestionRequest,
    GetNextQuestionResponse,
    EvaluateResponseRequest,
    EvaluateResponseResponse,
    ConcludeVivaRequest,
    ConcludeVivaResponse,
} from "@/types/viva";

/**
 * Base URL for the backend API
 * Can be configured via environment variable
 */
const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

/**
 * Custom error class for API errors
 */
export class APIError extends Error {
    constructor(
        message: string,
        public status?: number,
        public data?: unknown
    ) {
        super(message);
        this.name = "APIError";
    }
}

/**
 * Generic fetch wrapper with error handling
 */
async function fetchAPI<T>(
    endpoint: string,
    options: RequestInit = {}
): Promise<T> {
    const url = `${API_BASE_URL}${endpoint}`;

    try {
        const response = await fetch(url, {
            ...options,
            headers: {
                "Content-Type": "application/json",
                ...options.headers,
            },
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
        if (error instanceof APIError) {
            throw error;
        }
        throw new APIError(
            error instanceof Error ? error.message : "Network error"
        );
    }
}

/**
 * Start a new viva session
 * @param request - Viva configuration
 * @returns Session details including ephemeral token
 */
export async function startVivaSession(
    request: VivaStartRequest
): Promise<VivaStartResponse> {
    return fetchAPI<VivaStartResponse>("/api/v1/viva/start", {
        method: "POST",
        body: JSON.stringify(request),
    });
}

/**
 * Get the next question for the viva
 * @param request - Question request parameters
 * @returns Next question details
 */
export async function getNextQuestion(
    request: GetNextQuestionRequest
): Promise<GetNextQuestionResponse> {
    return fetchAPI<GetNextQuestionResponse>("/api/v1/viva/get-next-question", {
        method: "POST",
        body: JSON.stringify(request),
    });
}

/**
 * Evaluate a student's response
 * @param request - Evaluation parameters
 * @returns Evaluation confirmation
 */
export async function evaluateResponse(
    request: EvaluateResponseRequest
): Promise<EvaluateResponseResponse> {
    return fetchAPI<EvaluateResponseResponse>("/api/v1/viva/evaluate-response", {
        method: "POST",
        body: JSON.stringify(request),
    });
}

/**
 * Conclude the viva session
 * @param request - Conclusion parameters
 * @returns Final results and feedback
 */
export async function concludeViva(
    request: ConcludeVivaRequest
): Promise<ConcludeVivaResponse> {
    return fetchAPI<ConcludeVivaResponse>("/api/v1/viva/conclude-viva", {
        method: "POST",
        body: JSON.stringify(request),
    });
}

/**
 * Health check endpoint
 * @returns Health status
 */
export async function healthCheck(): Promise<{ status: string }> {
    return fetchAPI<{ status: string }>("/health");
}
