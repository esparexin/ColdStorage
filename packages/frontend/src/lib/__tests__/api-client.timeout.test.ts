import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  AUTH_BOOTSTRAP_OVERALL_TIMEOUT_MS,
  AUTH_REQUEST_TIMEOUT_MS,
  LOGIN_REQUEST_TIMEOUT_MS,
  executeSingleFlightRefresh,
  fetchWithTimeout,
  getLastRefreshFailure,
  requestWithAuth,
  resetLastRefreshFailure,
} from '../api-client';

function hungFetch(_url: string, init?: RequestInit): Promise<Response> {
  // Never resolves on its own; rejects only when the caller aborts.
  return new Promise((_resolve, reject) => {
    init?.signal?.addEventListener('abort', () => {
      reject(new DOMException('This operation was aborted', 'AbortError'));
    });
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  resetLastRefreshFailure();
});

describe('api-client auth timeout', () => {
  it('fetchWithTimeout aborts a hung request instead of hanging', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string, init?: RequestInit) => hungFetch(url, init)),
    );
    await expect(fetchWithTimeout('/api/auth/refresh', {}, 50)).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('hung refresh resolves to null promptly, sets timeout failure type, and resets single-flight', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string, init?: RequestInit) => hungFetch(url, init)),
    );
    const first = await executeSingleFlightRefresh(50);
    expect(first).toBeNull();
    expect(getLastRefreshFailure()).toBe('timeout');

    // Second call must issue a fresh fetch, not reuse a stuck promise.
    const second = await executeSingleFlightRefresh(50);
    expect(second).toBeNull();
    expect(vi.mocked(fetch).mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it('classifies network error vs 401 unauthorized vs success properly', async () => {
    // 1. Network drop (fetch throws TypeError)
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new TypeError('Failed to fetch'))),
    );
    const resNet = await executeSingleFlightRefresh(100);
    expect(resNet).toBeNull();
    expect(getLastRefreshFailure()).toBe('network');

    // 2. HTTP 401 Unauthorized
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response(JSON.stringify({ error: 'Expired' }), { status: 401 }))),
    );
    const resAuth = await executeSingleFlightRefresh(100);
    expect(resAuth).toBeNull();
    expect(getLastRefreshFailure()).toBe('unauthorized');

    // 3. HTTP 200 Success
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(
          new Response(JSON.stringify({ token: 'jwt-123', user: { username: 'testuser' } }), { status: 200 }),
        ),
      ),
    );
    const resOk = await executeSingleFlightRefresh(100);
    expect(resOk).toEqual({ token: 'jwt-123', user: { username: 'testuser' } });
    expect(getLastRefreshFailure()).toBeNull();
  });

  it('bootstrap overall deadline exceeds the single-fetch bound but stays far below 60s', () => {
    // Per-fetch 12s bounds each HTTP call; the 15s overall deadline bounds
    // their sum so stacked retries (refresh + retry-once) can never hold the
    // "Checking authentication…" gate toward ~48-60s.
    expect(AUTH_REQUEST_TIMEOUT_MS).toBe(12000);
    expect(AUTH_BOOTSTRAP_OVERALL_TIMEOUT_MS).toBe(15000);
    expect(AUTH_BOOTSTRAP_OVERALL_TIMEOUT_MS).toBeGreaterThan(AUTH_REQUEST_TIMEOUT_MS);
    expect(AUTH_BOOTSTRAP_OVERALL_TIMEOUT_MS).toBeLessThan(60000);
    expect(LOGIN_REQUEST_TIMEOUT_MS).toBe(30000);
  });

  it('bootstrap race falls through to login when refresh hangs past the deadline', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string, init?: RequestInit) => hungFetch(url, init)),
    );
    // Mirrors AuthContext bootstrap: race single-flight refresh vs. deadline.
    const refreshTask = executeSingleFlightRefresh<unknown>(200);
    const deadlineTask = new Promise<null>((resolve) => {
      setTimeout(() => resolve(null), 50);
    });
    const start = Date.now();
    const result = await Promise.race([refreshTask, deadlineTask]);
    expect(result).toBeNull();
    expect(Date.now() - start).toBeLessThan(1000);
  });

  it('requestWithAuth never recurses on the refresh endpoint itself', async () => {
    const fetchMock = vi.fn((_url: string) => Promise.resolve(new Response(null, { status: 401 })));
    vi.stubGlobal('fetch', fetchMock);
    const start = Date.now();
    const res = await requestWithAuth('/api/auth/refresh', { method: 'POST' });
    expect(res.status).toBe(401);
    // Single HTTP call — no recursive refresh attempt.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(Date.now() - start).toBeLessThan(2000);
  });
});
