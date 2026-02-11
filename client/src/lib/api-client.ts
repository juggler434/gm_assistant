import type { ApiErrorResponse } from "@/types";

/**
 * Typed API error thrown when a request returns a non-OK status.
 */
export class ApiError extends Error {
  public readonly statusCode: number;
  public readonly errorType: string;

  constructor(response: ApiErrorResponse) {
    super(response.message);
    this.name = "ApiError";
    this.statusCode = response.statusCode;
    this.errorType = response.error;
  }
}

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...options,
    credentials: "include",
    headers: {
      ...options?.headers,
    },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({
      statusCode: res.status,
      error: res.statusText,
      message: "An unexpected error occurred",
    }));
    throw new ApiError(body as ApiErrorResponse);
  }

  // Handle 204 No Content
  if (res.status === 204) {
    return undefined as T;
  }

  return res.json() as Promise<T>;
}

function jsonHeaders(): HeadersInit {
  return { "Content-Type": "application/json" };
}

export const api = {
  get<T>(url: string): Promise<T> {
    return request<T>(url);
  },

  post<T>(url: string, body?: unknown): Promise<T> {
    return request<T>(url, {
      method: "POST",
      headers: jsonHeaders(),
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  },

  patch<T>(url: string, body: unknown): Promise<T> {
    return request<T>(url, {
      method: "PATCH",
      headers: jsonHeaders(),
      body: JSON.stringify(body),
    });
  },

  delete<T>(url: string): Promise<T> {
    return request<T>(url, { method: "DELETE" });
  },

  /**
   * POST a multipart/form-data request (e.g. file uploads).
   * Do NOT set Content-Type — the browser sets it with the boundary.
   */
  upload<T>(url: string, formData: FormData): Promise<T> {
    return request<T>(url, {
      method: "POST",
      body: formData,
    });
  },

  /**
   * POST a request that returns an SSE stream.
   * Yields parsed JSON objects from each `data:` line.
   */
  async *stream<T>(url: string, body: unknown): AsyncGenerator<T> {
    const res = await fetch(url, {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        Accept: "text/event-stream",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errorBody = await res.json().catch(() => ({
        statusCode: res.status,
        error: res.statusText,
        message: "An unexpected error occurred",
      }));
      throw new ApiError(errorBody as ApiErrorResponse);
    }

    const reader = res.body?.getReader();
    if (!reader) return;

    const decoder = new TextDecoder();
    let buffer = "";

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed.startsWith("data:")) {
            const json = trimmed.slice(5).trim();
            if (json) {
              yield JSON.parse(json) as T;
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  },
};
