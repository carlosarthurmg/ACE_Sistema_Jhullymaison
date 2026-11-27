import type { ApiResponse } from "@/types/api.types";

// Arquivo COMPARTILHADO. O frontend só chama /api/* (cookie HttpOnly vai
// automaticamente). Nunca guarde token em localStorage.
export class ApiError extends Error {
  status: number;
  code: string;
  details: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

async function request<T>(method: string, url: string, body?: unknown): Promise<T> {
  const response = await fetch(url, {
    method,
    credentials: "same-origin",
    headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (response.status === 204) return undefined as T;

  const payload = (await response.json().catch(() => null)) as ApiResponse<T> | null;

  if (!response.ok || payload?.error) {
    throw new ApiError(
      response.status,
      payload?.error?.code ?? "UNKNOWN_ERROR",
      payload?.error?.message ?? "Erro inesperado. Tente novamente.",
      payload?.error?.details,
    );
  }
  return payload?.data as T;
}

export const api = {
  get: <T>(url: string) => request<T>("GET", url),
  post: <T>(url: string, body?: unknown) => request<T>("POST", url, body ?? {}),
  put: <T>(url: string, body?: unknown) => request<T>("PUT", url, body ?? {}),
  patch: <T>(url: string, body?: unknown) => request<T>("PATCH", url, body ?? {}),
  delete: <T>(url: string) => request<T>("DELETE", url),
};
