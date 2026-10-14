/**
 * api-cache.ts — In-memory client cache for static and reference data.
 *
 * Guarantees:
 * - Module-scoped memory cache (browser heap only; never written to localStorage/sessionStorage).
 * - Single-flight deduplication: concurrent reads for the same URL share one in-flight Promise.
 * - TTL-bounded: fresh entries return instantly without network round-trips.
 * - Standard Response compatibility: returns a new Fetch Response, drop-in replacement for requestWithAuth.
 * - Targeted invalidation: enables clearing by URL prefix when mutations occur.
 */

import { requestWithAuth } from './api-client';

export const DEFAULT_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

interface CacheEntry {
  data: unknown;
  status: number;
  headers: Record<string, string>;
  expiresAt: number;
}

interface InFlightResult {
  entry?: CacheEntry;
  errorResponse?: Response;
}

const cache = new Map<string, CacheEntry>();
const inFlight = new Map<string, Promise<InFlightResult>>();

function createCachedResponse(entry: CacheEntry): Response {
  return new Response(JSON.stringify(entry.data), {
    status: entry.status,
    headers: {
      ...entry.headers,
      'Content-Type': 'application/json',
      'X-Client-Cache': 'HIT',
    },
  });
}

export interface CachedRequestOptions extends RequestInit {
  ttlMs?: number;
  force?: boolean;
}

/**
 * Fetches via requestWithAuth with module-level in-memory caching and request coalescing.
 * Only GET requests are cached. Non-GET methods bypass the cache and pass through directly.
 */
export async function cachedRequestWithAuth(
  url: string,
  options: CachedRequestOptions = {},
): Promise<Response> {
  const method = (options.method ?? 'GET').toUpperCase();
  if (method !== 'GET') {
    return requestWithAuth(url, options);
  }

  const { ttlMs = DEFAULT_CACHE_TTL_MS, force = false, ...fetchOptions } = options;

  // 1. Cache HIT
  if (!force) {
    const existing = cache.get(url);
    if (existing && Date.now() < existing.expiresAt) {
      return createCachedResponse(existing);
    }
  }

  // 2. Coalesce in-flight requests or start a new flight
  let flightPromise = inFlight.get(url);
  if (!flightPromise) {
    flightPromise = (async (): Promise<InFlightResult> => {
      try {
        const res = await requestWithAuth(url, fetchOptions);
        if (!res.ok) {
          return { errorResponse: res };
        }

        const text = await res.text();
        let parsed: unknown = null;
        try {
          parsed = JSON.parse(text);
        } catch {
          // Non-JSON response, do not cache
          return {
            errorResponse: new Response(text, {
              status: res.status,
              statusText: res.statusText,
              headers: res.headers,
            }),
          };
        }

        const headers: Record<string, string> = {};
        res.headers.forEach((val, key) => {
          headers[key] = val;
        });

        const entry: CacheEntry = {
          data: parsed,
          status: res.status,
          headers,
          expiresAt: Date.now() + ttlMs,
        };

        cache.set(url, entry);
        return { entry };
      } finally {
        inFlight.delete(url);
      }
    })();

    inFlight.set(url, flightPromise);
  }

  const result = await flightPromise;
  if (result.entry) {
    return createCachedResponse(result.entry);
  }

  return (
    result.errorResponse?.clone() ??
    new Response(null, { status: 500, statusText: 'Fetch failed' })
  );
}

/**
 * Direct typed JSON fetcher from cache.
 */
export async function fetchCachedJson<T>(
  url: string,
  options?: CachedRequestOptions,
): Promise<T> {
  const res = await cachedRequestWithAuth(url, options);
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

/**
 * Invalidates cache entries matching a prefix or RegExp pattern.
 */
export function invalidateCache(pattern?: string | RegExp): void {
  if (!pattern) {
    cache.clear();
    return;
  }
  for (const key of Array.from(cache.keys())) {
    if (typeof pattern === 'string') {
      if (key.startsWith(pattern)) {
        cache.delete(key);
      }
    } else if (pattern.test(key)) {
      cache.delete(key);
    }
  }
}

/**
 * Clears all cached entries and aborts in-flight references.
 */
export function clearCache(): void {
  cache.clear();
  inFlight.clear();
}

/**
 * Returns the current number of cached entries (for diagnostics and testing).
 */
export function getCachedEntryCount(): number {
  return cache.size;
}
