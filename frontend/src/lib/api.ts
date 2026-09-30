const API_URL = import.meta.env.VITE_API_URL ?? "";
const TOKEN_KEY = "drb-token";

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string | null) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

async function request(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  // FormData (file uploads) sets its own multipart content type and boundary.
  if (init.body && !(init.body instanceof FormData) && !headers.has("content-type"))
    headers.set("content-type", "application/json");
  const token = getToken();
  if (token) headers.set("authorization", `Bearer ${token}`);

  const res = await fetch(`${API_URL}/api${path}`, { ...init, headers });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { message?: string | string[] } | null;
    const message = Array.isArray(body?.message) ? body.message.join(", ") : body?.message;
    throw new ApiError(res.status, message ?? res.statusText);
  }
  return res;
}

/** A message for the user from a failed API call. */
export function errorText(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 403) return "You don’t have permission to do that.";
    return error.message;
  }
  return "Couldn’t reach the clinic server. Make sure the backend is running.";
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await request(path, init);
  return (res.status === 204 ? undefined : await res.json()) as T;
}

/** A file from the API (e.g. an invoice PDF), fetched with the signed-in user's token. */
export async function apiBlob(path: string): Promise<Blob> {
  return (await request(path)).blob();
}
