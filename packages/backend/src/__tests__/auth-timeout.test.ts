import mongoose from 'mongoose';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  MONGO_CONNECT_TIMEOUT_MS,
  MONGO_SERVER_SELECTION_TIMEOUT_MS,
  MONGO_SOCKET_TIMEOUT_MS,
  connectToDatabase,
  disconnectDatabase,
} from '../database/connection.js';
import { AuditLogModel } from '../database/models/audit-log.model.js';
import {
  UpstashRedisRateLimitStore,
  setDefaultRateLimitStore,
  MemoryRateLimitStore,
} from '../middleware/rate-limiter.middleware.js';
import { auditService } from '../modules/audit/audit.service.js';

/**
 * Regression tests for the ~60s "Checking authentication…" gate hang.
 *
 * Covers the backend half of the root cause: unbounded MongoDB buffering,
 * unbounded Upstash REST fetches, and silent audit-log loss. Frontend hangs
 * are covered in `packages/frontend/src/lib/__tests__/api-client.timeout.test.ts`.
 */

function hungFetch(_url: string, init?: RequestInit): Promise<Response> {
  // Never resolves on its own; rejects only when the caller aborts.
  return new Promise((_resolve, reject) => {
    if (init?.signal?.aborted) {
      reject(new DOMException('This operation was aborted', 'AbortError'));
      return;
    }
    init?.signal?.addEventListener('abort', () => {
      reject(new DOMException('This operation was aborted', 'AbortError'));
    });
  });
}

describe('auth timeout fail-fast', () => {
  beforeAll(async () => {
    await connectToDatabase();
  });

  afterAll(async () => {
    setDefaultRateLimitStore(new MemoryRateLimitStore());
    await disconnectDatabase();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('bounds MongoDB fail-fast timeouts well below the observed 60s hang', () => {
    // Two consecutive server-selection windows must never sum to ~60s.
    // 2 × 5s = 10s worst case, inside the frontend 12s per-fetch abort.
    expect(MONGO_SERVER_SELECTION_TIMEOUT_MS).toBe(5000);
    expect(MONGO_CONNECT_TIMEOUT_MS).toBe(5000);
    expect(MONGO_SOCKET_TIMEOUT_MS).toBe(10000);
    expect(MONGO_SERVER_SELECTION_TIMEOUT_MS * 2).toBeLessThan(12000);
  });

  it('falls back to memory promptly when Upstash hangs instead of holding auth', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((_url: string, init?: RequestInit) => hungFetch(_url, init)),
    );
    const store = new UpstashRedisRateLimitStore('https://upstash.test', 'test-token');

    const start = Date.now();
    const result = await store.increment('ratelimit:auth:1.2.3.4', 15 * 60 * 1000);
    const elapsedMs = Date.now() - start;

    // Memory fallback answers with count 1; must resolve near the 1500ms
    // abort bound, never near the old unbounded (~60s) hang.
    expect(result.count).toBe(1);
    expect(result.resetAt).toBeGreaterThan(Date.now());
    expect(elapsedMs).toBeLessThan(4000);
  });

  it('Upstash reset is fail-open when the network hangs', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((_url: string, init?: RequestInit) => hungFetch(_url, init)),
    );
    const store = new UpstashRedisRateLimitStore('https://upstash.test', 'test-token');

    const start = Date.now();
    await expect(store.reset('ratelimit:auth:1.2.3.4')).resolves.toBeUndefined();
    expect(Date.now() - start).toBeLessThan(4000);
  });

  it('audit log returns null instead of throwing when persistence fails', async () => {
    const spy = vi.spyOn(AuditLogModel, 'create').mockRejectedValueOnce(new Error('db down'));
    const result = await auditService.log({
      eventType: 'AUTH_LOGIN_FAILED',
      severity: 'SECURITY',
      resource: 'auth',
      details: { reason: 'TEST_PERSISTENCE_FAILURE' },
    });
    expect(result).toBeNull();
    spy.mockRestore();
  });

  it('audit failure does not break subsequent audit writes', async () => {
    await mongoose.connection.collection('auditlogs').deleteMany({});
    const spy = vi.spyOn(AuditLogModel, 'create').mockRejectedValueOnce(new Error('db down'));
    expect(
      await auditService.log({ eventType: 'AUTH_LOGOUT', severity: 'INFO', resource: 'auth' }),
    ).toBeNull();
    spy.mockRestore();

    const doc = await auditService.log({
      eventType: 'AUTH_LOGOUT',
      severity: 'INFO',
      resource: 'auth',
    });
    expect(doc).not.toBeNull();
    expect(doc?.eventType).toBe('AUTH_LOGOUT');
  });
});
