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
};
