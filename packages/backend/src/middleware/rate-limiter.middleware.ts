import type { NextFunction, Request, Response } from 'express';
import { config } from '../config.js';
import { auditService } from '../modules/audit/audit.service.js';
import { logger } from '../utils/logger.js';
import {
  MemoryRateLimitStore,
  startMemoryStoreSweep,
  stopMemoryStoreSweep,
} from './memory-rate-limit.store.js';
import { normalizeRateLimitIp } from './rate-limit-ip.helper.js';

export { MemoryRateLimitStore, startMemoryStoreSweep, stopMemoryStoreSweep };

export interface RateLimitStore {
  increment(key: string, windowMs: number): Promise<{ count: number; resetAt: number }>;
  reset?(key: string): Promise<void>;
  clear?(): Promise<void>;
}

export class UpstashRedisRateLimitStore implements RateLimitStore {
  private memoryFallback = new MemoryRateLimitStore();
  constructor(private readonly url: string, private readonly token: string) {}

  /** Bounded Upstash timeout (1.5s); fail-open to memory, Redis never stores sessions. */
  private static readonly UPSTASH_FETCH_TIMEOUT_MS = 1500;

  private upstashSignal(): AbortSignal {
    return AbortSignal.timeout(UpstashRedisRateLimitStore.UPSTASH_FETCH_TIMEOUT_MS);
  }

  async increment(key: string, windowMs: number): Promise<{ count: number; resetAt: number }> {
    const incrementStart = Date.now();
    try {
      const response = await fetch(`${this.url}/pipeline`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify([
          ['INCR', key],
          ['PEXPIRE', key, windowMs, 'NX'],
          ['PTTL', key],
        ]),
        signal: this.upstashSignal(),
      });

      if (!response.ok) {
        throw new Error(`Upstash returned HTTP ${response.status}`);
      }

      const results = (await response.json()) as Array<{ result: unknown }>;
      const count = Number(results[0]?.result) || 1;
      const rawTtl = Number(results[2]?.result);
      const ttl = rawTtl > 0 ? rawTtl : windowMs;

      return { count, resetAt: Date.now() + ttl };
    } catch {
      return this.memoryFallback.increment(key, windowMs);
    } finally {
      const elapsedMs = Date.now() - incrementStart;
      if (elapsedMs > UpstashRedisRateLimitStore.UPSTASH_FETCH_TIMEOUT_MS) {
        logger.warn('Rate-limit Upstash slow', { elapsedMs, key });
      }
    }
  }

  async reset(key: string): Promise<void> {
    try {
      await fetch(`${this.url}/del/${encodeURIComponent(key)}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.token}`,
        },
        signal: this.upstashSignal(),
      });
    } catch {
      await this.memoryFallback.reset(key);
    }
  }

  async clear(): Promise<void> {
    await this.memoryFallback.clear();
  }
}

let defaultStore: RateLimitStore | null = null;

export function getDefaultRateLimitStore(): RateLimitStore {
  if (!defaultStore) {
    if (config.upstashRedisRestUrl && config.upstashRedisRestToken) {
      defaultStore = new UpstashRedisRateLimitStore(
        config.upstashRedisRestUrl,
        config.upstashRedisRestToken,
      );
    } else {
      const memory = new MemoryRateLimitStore();
      startMemoryStoreSweep(memory);
      defaultStore = memory;
    }
  }
  return defaultStore;
}

export function setDefaultRateLimitStore(store: RateLimitStore): void {
  defaultStore = store;
}

/** Test-only reset to prevent cross-suite contamination (no-op on Redis). */
export function clearRateLimiterStore(): void {
  if (defaultStore instanceof MemoryRateLimitStore) {
    defaultStore.clear();
  }
}

/** Resets auth counter after success (OWASP: count consecutive failures). */
export async function resetAuthRateLimit(req: Request): Promise<void> {
  const store = getDefaultRateLimitStore();
  const identifier = normalizeRateLimitIp(req.ip || req.socket.remoteAddress || '127.0.0.1');
  await store.reset?.(`ratelimit:auth:${identifier}`);
}

export interface RateLimiterOptions {
  windowMs: number;
  max: number;
  keyPrefix: string;
  keyGenerator?: (req: Request) => string;
  store?: RateLimitStore;
  /** Fail-closed returns 503 when the store errors (auth paths); default fail-open. */
  failClosed?: boolean;
}

export function createRateLimiter(options: RateLimiterOptions) {
  const {
    windowMs,
    max,
    keyPrefix,
    failClosed = false,
    keyGenerator = (req: Request) =>
      normalizeRateLimitIp(req.ip || req.socket.remoteAddress || '127.0.0.1'),
  } = options;

  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const store = options.store || getDefaultRateLimitStore();
    const identifier = keyGenerator(req);
    const key = `${keyPrefix}:${identifier}`;

    try {
      const { count, resetAt } = await store.increment(key, windowMs);
      const resetEpochSeconds = Math.ceil(resetAt / 1000);

      res.setHeader('RateLimit-Limit', max.toString());

      if (count <= max) {
        res.setHeader('RateLimit-Remaining', Math.max(0, max - count).toString());
        res.setHeader('RateLimit-Reset', resetEpochSeconds.toString());
        next();
        return;
      }

      const retryAfterSeconds = Math.max(1, Math.ceil((resetAt - Date.now()) / 1000));
      res.setHeader('RateLimit-Remaining', '0');
      res.setHeader('RateLimit-Reset', resetEpochSeconds.toString());
      res.setHeader('Retry-After', retryAfterSeconds.toString());

      void auditService.log({
        eventType: 'ACCESS_DENIED',
        severity: 'SECURITY',
        userId: req.user?.userId,
        username: req.user?.username || 'anonymous',
        userRole: req.user?.role || 'ANONYMOUS',
        facilityId: null,
        ipAddress: req.ip || req.socket.remoteAddress,
        userAgent: req.headers['user-agent'] as string | undefined,
        resource: 'rate-limiter',
        resourceId: keyPrefix,
        details: {
          path: req.originalUrl || req.path,
          method: req.method,
          keyPrefix,
          retryAfterSeconds,
          count,
          max,
        },
      });

      res.status(429).json({
        error: 'TOO_MANY_REQUESTS: Rate limit exceeded. Please retry after specified window.',
        retryAfterSeconds,
      });
    } catch {
      if (failClosed) {
        res.setHeader('Retry-After', '30');
        res.status(503).json({ error: 'Service temporarily unavailable. Please retry shortly.' });
        return;
      }
      // Fail open for general traffic to preserve availability.
      next();
    }
  };
}

export const authRateLimiter = createRateLimiter({
  windowMs: config.rateLimitWindowMsAuth,
  max: config.rateLimitMaxAuth,
  keyPrefix: 'ratelimit:auth',
  failClosed: true,
  keyGenerator: (req: Request) =>
    normalizeRateLimitIp(req.ip || req.socket.remoteAddress || '127.0.0.1'),
});

export const mutationsRateLimiter = createRateLimiter({
  windowMs: config.rateLimitWindowMsMutations,
  max: config.rateLimitMaxMutations,
  keyPrefix: 'ratelimit:mutations',
  keyGenerator: (req: Request) =>
    req.user?.userId ||
    normalizeRateLimitIp(req.ip || req.socket.remoteAddress || 'anonymous'),
});

/** Generous per-user guard for CSV exports: prevents scraping without blocking legit use. */
export const exportRateLimiter = createRateLimiter({
  windowMs: 5 * 60 * 1000,
  max: 30,
  keyPrefix: 'ratelimit:exports',
  keyGenerator: (req: Request) =>
    req.user?.userId ||
    normalizeRateLimitIp(req.ip || req.socket.remoteAddress || 'anonymous'),
});

export const generalRateLimiter = createRateLimiter({
  windowMs: config.rateLimitWindowMsGeneral,
  max: config.rateLimitMaxGeneral,
  keyPrefix: 'ratelimit:general',
  // IP-only (F05): runs before authenticate, so req.user is always undefined.
  keyGenerator: (req: Request) =>
    normalizeRateLimitIp(req.ip || req.socket.remoteAddress || 'anonymous'),
});
