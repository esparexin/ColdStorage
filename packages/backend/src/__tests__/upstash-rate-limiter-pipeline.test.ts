import { afterEach, describe, expect, it, vi } from 'vitest';
import { UpstashRedisRateLimitStore } from '../middleware/rate-limiter.middleware.js';

describe('UpstashRedisRateLimitStore Single Pipeline', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('executes INCR, PEXPIRE NX, and PTTL in a single atomic pipeline request', async () => {
    const fetchCalls: Array<{ url: string; body: unknown }> = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        fetchCalls.push({
          url,
          body: init?.body ? JSON.parse(init.body as string) : undefined,
        });
        return new Response(
          JSON.stringify([
            { result: 1 },
            { result: 1 },
            { result: 60000 },
          ]),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }),
    );

    const store = new UpstashRedisRateLimitStore('https://upstash.test', 'test-token');
    const start = Date.now();
    const result = await store.increment('ratelimit:auth:10.0.0.1', 60000);

    expect(fetchCalls).toHaveLength(1);
    expect(fetchCalls[0].url).toBe('https://upstash.test/pipeline');
    expect(fetchCalls[0].body).toEqual([
      ['INCR', 'ratelimit:auth:10.0.0.1'],
      ['PEXPIRE', 'ratelimit:auth:10.0.0.1', 60000, 'NX'],
      ['PTTL', 'ratelimit:auth:10.0.0.1'],
    ]);
    expect(result.count).toBe(1);
    expect(result.resetAt).toBeGreaterThanOrEqual(start + 60000);
  });

  it('handles existing keys correctly without modifying existing TTL', async () => {
    const fetchCalls: Array<{ url: string; body: unknown }> = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        fetchCalls.push({
          url,
          body: init?.body ? JSON.parse(init.body as string) : undefined,
        });
        return new Response(
          JSON.stringify([
            { result: 5 },
            { result: 0 },
            { result: 42000 },
          ]),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }),
    );

    const store = new UpstashRedisRateLimitStore('https://upstash.test', 'test-token');
    const result = await store.increment('ratelimit:auth:10.0.0.1', 60000);

    expect(fetchCalls).toHaveLength(1);
    expect(result.count).toBe(5);
    expect(result.resetAt).toBeGreaterThan(Date.now() + 40000);
  });

  it('falls back to windowMs if PTTL result is non-positive without extra fetch', async () => {
    const fetchCalls: Array<{ url: string }> = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        fetchCalls.push({ url });
        return new Response(
          JSON.stringify([
            { result: 1 },
            { result: 1 },
            { result: -1 },
          ]),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }),
    );

    const store = new UpstashRedisRateLimitStore('https://upstash.test', 'test-token');
    const result = await store.increment('ratelimit:auth:10.0.0.1', 60000);

    expect(fetchCalls).toHaveLength(1);
    expect(result.count).toBe(1);
    expect(result.resetAt).toBeGreaterThanOrEqual(Date.now() + 59000);
  });
});
