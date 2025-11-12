// Based on app/main.py Pydantic models
export interface VivaStartRequest {
  student_name: string;
  topic: string;
  class_level: string;
}

export interface VivaStartResponse {
  session_id: string;
}

// Get the backend URL from the environment variable
const HTTP_URL =
  process.env.NEXT_PUBLIC_BACKEND_HTTP_URL || "http://localhost:8000";

/**
 * Calls the backend /start-viva endpoint to create a new session.
 * @param {VivaStartRequest} data - The details for the new viva session.
 * @returns {Promise<VivaStartResponse>} The response containing the new session ID.
 * @throws Will throw an error if the network request fails.
 */
export async function startVivaSession(
  data: VivaStartRequest,
): Promise<VivaStartResponse> {
  const response = await fetch(`${HTTP_URL}/start-viva`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(
      errorData.detail || "Failed to start viva session",
    );
  }

  return response.json();
}