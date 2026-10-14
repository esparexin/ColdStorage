import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as apiClient from '../api-client';
import {
  cachedRequestWithAuth,
  fetchCachedJson,
  invalidateCache,
  clearCache,
  getCachedEntryCount,
} from '../api-cache';

vi.mock('../api-client', () => ({
  requestWithAuth: vi.fn(),
}));

describe('api-cache', () => {
  beforeEach(() => {
    clearCache();
    vi.clearAllMocks();
  });

  it('serves subsequent GET requests from memory cache', async () => {
    const mockData = { items: [{ id: 'comm-1', name: 'Potatoes' }] };
    vi.mocked(apiClient.requestWithAuth).mockResolvedValueOnce(
      new Response(JSON.stringify(mockData), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const res1 = await cachedRequestWithAuth('/api/commodities');
    expect(res1.ok).toBe(true);
    const data1 = await res1.json();
    expect(data1).toEqual(mockData);
    expect(apiClient.requestWithAuth).toHaveBeenCalledTimes(1);
    expect(getCachedEntryCount()).toBe(1);

    // Second request should be a cache HIT and not call requestWithAuth
    const res2 = await cachedRequestWithAuth('/api/commodities');
    expect(res2.ok).toBe(true);
    expect(res2.headers.get('X-Client-Cache')).toBe('HIT');
    const data2 = await res2.json();
    expect(data2).toEqual(mockData);
    expect(apiClient.requestWithAuth).toHaveBeenCalledTimes(1);
  });

  it('coalesces concurrent in-flight requests for the same URL', async () => {
    const mockData = { items: [{ id: 'cust-1', name: 'Kisan Traders' }] };
    let resolveRequest: (res: Response) => void;
    const delayedPromise = new Promise<Response>((resolve) => {
      resolveRequest = resolve;
    });

    vi.mocked(apiClient.requestWithAuth).mockReturnValueOnce(delayedPromise);

    // Issue 3 simultaneous calls
    const p1 = cachedRequestWithAuth('/api/customers?facilityId=fac-1');
    const p2 = cachedRequestWithAuth('/api/customers?facilityId=fac-1');
    const p3 = cachedRequestWithAuth('/api/customers?facilityId=fac-1');

    resolveRequest!(
      new Response(JSON.stringify(mockData), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const [res1, res2, res3] = await Promise.all([p1, p2, p3]);

    expect(await res1.json()).toEqual(mockData);
    expect(await res2.json()).toEqual(mockData);
    expect(await res3.json()).toEqual(mockData);
    expect(apiClient.requestWithAuth).toHaveBeenCalledTimes(1);
  });

  it('bypasses cache when force is true', async () => {
    const initialData = { items: [{ id: '1', name: 'Initial' }] };
    const refreshedData = { items: [{ id: '1', name: 'Refreshed' }] };

    vi.mocked(apiClient.requestWithAuth)
      .mockResolvedValueOnce(
        new Response(JSON.stringify(initialData), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify(refreshedData), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );

    await cachedRequestWithAuth('/api/commodities');
    expect(apiClient.requestWithAuth).toHaveBeenCalledTimes(1);

    const forceRes = await cachedRequestWithAuth('/api/commodities', { force: true });
    expect(await forceRes.json()).toEqual(refreshedData);
    expect(apiClient.requestWithAuth).toHaveBeenCalledTimes(2);
  });

  it('bypasses cache for non-GET methods', async () => {
    vi.mocked(apiClient.requestWithAuth).mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: true }), { status: 200 }),
    );

    await cachedRequestWithAuth('/api/commodities', { method: 'POST', body: '{}' });
    expect(apiClient.requestWithAuth).toHaveBeenCalledTimes(1);
    expect(getCachedEntryCount()).toBe(0);
  });

  it('does not cache HTTP error responses', async () => {
    vi.mocked(apiClient.requestWithAuth).mockResolvedValueOnce(
      new Response(JSON.stringify({ error: 'Server error' }), { status: 500 }),
    );

    const res = await cachedRequestWithAuth('/api/commodities');
    expect(res.status).toBe(500);
    expect(getCachedEntryCount()).toBe(0);
  });

  it('invalidates matching entries by prefix or regex', async () => {
    vi.mocked(apiClient.requestWithAuth)
      .mockResolvedValueOnce(new Response('{"data": 1}', { status: 200 }))
      .mockResolvedValueOnce(new Response('{"data": 2}', { status: 200 }))
      .mockResolvedValueOnce(new Response('{"data": 3}', { status: 200 }));

    await cachedRequestWithAuth('/api/commodities');
    await cachedRequestWithAuth('/api/commodities/comm-1/rates');
    await cachedRequestWithAuth('/api/customers?facilityId=fac-1');
    expect(getCachedEntryCount()).toBe(3);

    invalidateCache('/api/commodities');
    expect(getCachedEntryCount()).toBe(1);

    invalidateCache(/customers/);
    expect(getCachedEntryCount()).toBe(0);
  });

  it('fetchCachedJson parses typed data and throws on HTTP error', async () => {
    vi.mocked(apiClient.requestWithAuth).mockResolvedValueOnce(
      new Response(JSON.stringify({ items: [1, 2, 3] }), { status: 200 }),
    );

    const data = await fetchCachedJson<{ items: number[] }>('/api/numbers');
    expect(data.items).toEqual([1, 2, 3]);

    vi.mocked(apiClient.requestWithAuth).mockResolvedValueOnce(
      new Response(JSON.stringify({ error: 'Not allowed' }), { status: 403 }),
    );

    await expect(fetchCachedJson('/api/forbidden')).rejects.toThrow('Not allowed');
  });

  it('refetches when TTL has expired', async () => {
    vi.mocked(apiClient.requestWithAuth)
      .mockResolvedValueOnce(new Response('{"version": 1}', { status: 200 }))
      .mockResolvedValueOnce(new Response('{"version": 2}', { status: 200 }));

    // Request with 50ms TTL
    await cachedRequestWithAuth('/api/version', { ttlMs: 50 });
    expect(apiClient.requestWithAuth).toHaveBeenCalledTimes(1);

    // Wait 60ms
    await new Promise((r) => setTimeout(r, 60));

    const res = await cachedRequestWithAuth('/api/version', { ttlMs: 50 });
    expect(await res.json()).toEqual({ version: 2 });
    expect(apiClient.requestWithAuth).toHaveBeenCalledTimes(2);
  });
});
