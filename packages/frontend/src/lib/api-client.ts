/**
 * api-client.ts — Canonical API client for the P7 frontend.
 *
 * Ownership:
 *   - Owns the single in-memory access token value (browser-memory only).
 *   - Owns the single-flight refresh Promise (no concurrency allowed).
 *   - Owns authenticated fetch execution via requestWithAuth.
 *
 * Security invariants:
 *   - Access token is stored ONLY in module-level memory (activeAccessToken).
 *   - Access token is NEVER written to localStorage, sessionStorage, or cookies.
 *   - Refresh token is an HTTP-only cookie; it is NEVER read or written by JS.
 *   - /api/auth/refresh is NEVER recursively called if it returns 401.
 *   - Concurrent 401 responses share one refreshPromise (single-flight).
 *   - Each failed request retries exactly once after a successful refresh.
 */

export interface RefreshResult<T = unknown> {
  token: string;
  user?: T;
}

let activeAccessToken: string | null = null;
let refreshPromise: Promise<RefreshResult | null> | null = null;

/** Called by AuthContext after login or bootstrap refresh. */
export function setAccessToken(token: string | null): void {
  activeAccessToken = token;
}

/** Used by AuthContext to read current token state. */
export function getAccessToken(): string | null {
  return activeAccessToken;
}

/**
 * Performs an authenticated fetch, automatically refreshing the access token
 * once on a 401 response. Never retries the refresh endpoint itself.
 */
export async function requestWithAuth(url: string, options: RequestInit = {}): Promise<Response> {
  const headers = new Headers(options.headers ?? {});
  if (activeAccessToken) {
    headers.set('Authorization', `Bearer ${activeAccessToken}`);
  }

  const response = await fetch(url, { ...options, headers, credentials: 'include' });

  // Guard: do not refresh if the request itself was to the refresh endpoint
  // (prevents infinite recursion on a failing refresh endpoint).
  if (response.status === 401 && !url.includes('/api/auth/refresh')) {
    const refreshResult = await executeSingleFlightRefresh();
    if (refreshResult?.token) {
      headers.set('Authorization', `Bearer ${refreshResult.token}`);
      // Retry exactly once with the new token
      return fetch(url, { ...options, headers, credentials: 'include' });
    }
  }

  return response;
}

/**
 * Executes a single-flight POST /api/auth/refresh.
 * Concurrent callers attach to the existing Promise; they do not issue
 * a second HTTP request.
 */
export async function executeSingleFlightRefresh<T = unknown>(): Promise<RefreshResult<T> | null> {
  // Attach concurrent 401 callers to the existing in-flight Promise
  if (refreshPromise !== null) {
    return refreshPromise as Promise<RefreshResult<T> | null>;
  }

  refreshPromise = (async (): Promise<RefreshResult<T> | null> => {
    try {
      const res = await fetch('/api/auth/refresh', {
        method: 'POST',
        credentials: 'include', // sends HTTP-only refreshToken cookie automatically
      });

      if (!res.ok) {
        setAccessToken(null);
        return null;
      }

      const data = (await res.json()) as { token: string; user?: T };
      setAccessToken(data.token);
      return { token: data.token, user: data.user };
    } catch {
      setAccessToken(null);
      return null;
    } finally {
      refreshPromise = null; // reset so the next 401 starts a new flight
    }
  })();

  return refreshPromise as Promise<RefreshResult<T> | null>;
}
