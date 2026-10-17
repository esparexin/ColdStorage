import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cachedRequestWithAuth, clearCache, getCachedEntryCount, invalidateCache } from '../../lib/api-cache';
import * as apiClient from '../../lib/api-client';

vi.mock('../../lib/api-client', () => ({
  requestWithAuth: vi.fn(),
}));

describe('Reference Data Caching and Targeted Invalidation', () => {
  beforeEach(() => {
    clearCache();
    vi.clearAllMocks();
  });

  describe('Facility reference data', () => {
    const mockFacilities = {
      items: [
        { id: 'fac-1', name: 'Main Cold Storage', code: 'MCS' },
        { id: 'fac-2', name: 'North Branch', code: 'NBR' },
      ],
    };

    it('caches /api/facilities and serves subsequent reads without extra network trips', async () => {
      vi.mocked(apiClient.requestWithAuth).mockResolvedValueOnce(
        new Response(JSON.stringify(mockFacilities), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );

      const res1 = await cachedRequestWithAuth('/api/facilities');
      expect(res1.ok).toBe(true);
      const data1 = await res1.json();
      expect(data1).toEqual(mockFacilities);
      expect(apiClient.requestWithAuth).toHaveBeenCalledTimes(1);

      // Second read should be served from memory cache (0 extra network calls)
      const res2 = await cachedRequestWithAuth('/api/facilities');
      expect(res2.ok).toBe(true);
      expect(res2.headers.get('X-Client-Cache')).toBe('HIT');
      const data2 = await res2.json();
      expect(data2).toEqual(mockFacilities);
      expect(apiClient.requestWithAuth).toHaveBeenCalledTimes(1);
    });

    it('targeted invalidation clears cached facilities on refresh/mutation', async () => {
      vi.mocked(apiClient.requestWithAuth).mockImplementation(() =>
        Promise.resolve(
          new Response(JSON.stringify(mockFacilities), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }),
        ),
      );

      await cachedRequestWithAuth('/api/facilities');
      expect(getCachedEntryCount()).toBe(1);

      // Trigger targeted invalidation
      invalidateCache('/api/facilities');
      expect(getCachedEntryCount()).toBe(0);

      // Forced fetch executes network request
      await cachedRequestWithAuth('/api/facilities', { force: true });
      expect(apiClient.requestWithAuth).toHaveBeenCalledTimes(2);
    });
  });

  describe('Settings reference data', () => {
    const mockSettings = {
      settings: {
        orgName: 'ColdStorage Inc',
        timezone: 'Asia/Kolkata',
      },
      isConfigured: true,
    };

    it('caches /api/settings and eliminates redundant network hits across renders', async () => {
      vi.mocked(apiClient.requestWithAuth).mockImplementation(() =>
        Promise.resolve(
          new Response(JSON.stringify(mockSettings), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }),
        ),
      );

      const res1 = await cachedRequestWithAuth('/api/settings');
      expect(res1.ok).toBe(true);
      const data1 = await res1.json();
      expect(data1).toEqual(mockSettings);
      expect(apiClient.requestWithAuth).toHaveBeenCalledTimes(1);

      // Cached hit
      const res2 = await cachedRequestWithAuth('/api/settings');
      expect(res2.ok).toBe(true);
      expect(res2.headers.get('X-Client-Cache')).toBe('HIT');
      expect(apiClient.requestWithAuth).toHaveBeenCalledTimes(1);
    });

    it('invalidates /api/settings on force refresh without impacting unrelated caches', async () => {
      vi.mocked(apiClient.requestWithAuth).mockImplementation(() =>
        Promise.resolve(
          new Response(JSON.stringify(mockSettings), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }),
        ),
      );

      await cachedRequestWithAuth('/api/settings');
      await cachedRequestWithAuth('/api/other-data');
      expect(getCachedEntryCount()).toBe(2);

      // Invalidate settings only
      invalidateCache('/api/settings');
      expect(getCachedEntryCount()).toBe(1);

      // Settings is re-fetched
      await cachedRequestWithAuth('/api/settings');
      expect(apiClient.requestWithAuth).toHaveBeenCalledTimes(3);
    });
  });
});
