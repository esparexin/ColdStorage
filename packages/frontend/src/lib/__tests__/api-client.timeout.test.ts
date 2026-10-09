import { afterEach, describe, expect, it, vi } from 'vitest';
import { executeSingleFlightRefresh, fetchWithTimeout } from '../api-client';

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
});
