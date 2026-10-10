import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  AUTH_BOOTSTRAP_OVERALL_TIMEOUT_MS,
  AUTH_REQUEST_TIMEOUT_MS,
  executeSingleFlightRefresh,
  fetchWithTimeout,
  requestWithAuth,
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
});

describe('api-client auth timeout', () => {
  it('fetchWithTimeout aborts a hung request instead of hanging', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string, init?: RequestInit) => hungFetch(url, init)),
    );
    await expect(fetchWithTimeout('/api/auth/refresh', {}, 50)).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('hung refresh resolves to null promptly and resets single-flight', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string, init?: RequestInit) => hungFetch(url, init)),
    );
    const first = await executeSingleFlightRefresh(50);
    expect(first).toBeNull();
    // Second call must issue a fresh fetch, not reuse a stuck promise.
    const second = await executeSingleFlightRefresh(50);
    expect(second).toBeNull();
    expect(vi.mocked(fetch).mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it('bootstrap overall deadline exceeds the single-fetch bound but stays far below 60s', () => {
    // Per-fetch 12s bounds each HTTP call; the 15s overall deadline bounds
    // their sum so stacked retries (refresh + retry-once) can never hold the
    // "Checking authentication…" gate toward ~48-60s.
    expect(AUTH_REQUEST_TIMEOUT_MS).toBe(12000);
    expect(AUTH_BOOTSTRAP_OVERALL_TIMEOUT_MS).toBe(15000);
    expect(AUTH_BOOTSTRAP_OVERALL_TIMEOUT_MS).toBeGreaterThan(AUTH_REQUEST_TIMEOUT_MS);
    expect(AUTH_BOOTSTRAP_OVERALL_TIMEOUT_MS).toBeLessThan(60000);
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
