import type { NextFunction, Request, Response } from 'express';
import { config } from '../config.js';
import { auditService } from '../modules/audit/audit.service.js';

export interface RateLimitStore {
  increment(key: string, windowMs: number): Promise<{ count: number; resetAt: number }>;
  reset?(key: string): Promise<void>;
  clear?(): Promise<void>;
}

export class MemoryRateLimitStore implements RateLimitStore {
  private hits = new Map<string, { count: number; resetAt: number }>();

  async increment(key: string, windowMs: number): Promise<{ count: number; resetAt: number }> {
    const now = Date.now();
    const entry = this.hits.get(key);

    if (!entry || entry.resetAt <= now) {
      const resetAt = now + windowMs;
      this.hits.set(key, { count: 1, resetAt });
      return { count: 1, resetAt };
    }

    entry.count += 1;
    return { count: entry.count, resetAt: entry.resetAt };
  }

  async reset(key: string): Promise<void> {
    this.hits.delete(key);
  }

  async clear(): Promise<void> {
    this.hits.clear();
  }
}

export class UpstashRedisRateLimitStore implements RateLimitStore {
  private memoryFallback = new MemoryRateLimitStore();

  constructor(
    private readonly url: string,
    private readonly token: string,
  ) {}

  async increment(key: string, windowMs: number): Promise<{ count: number; resetAt: number }> {
    try {
      const response = await fetch(`${this.url}/pipeline`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify([
          ['INCR', key],
          ['PTTL', key],
        ]),
      });

      if (!response.ok) {
        throw new Error(`Upstash returned HTTP ${response.status}`);
      }

      const results = (await response.json()) as Array<{ result: unknown }>;
      const count = Number(results[0]?.result) || 1;
      let ttl = Number(results[1]?.result);

      if (ttl < 0) {
        await fetch(`${this.url}/pexpire/${encodeURIComponent(key)}/${windowMs}`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${this.token}`,
          },
        });
        ttl = windowMs;
      }

      return { count, resetAt: Date.now() + ttl };
    } catch {
      return this.memoryFallback.increment(key, windowMs);
    }
  }

  async reset(key: string): Promise<void> {
    try {
      await fetch(`${this.url}/del/${encodeURIComponent(key)}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.token}`,
        },
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
      defaultStore = new MemoryRateLimitStore();
    }
  }
  return defaultStore;
}

export function setDefaultRateLimitStore(store: RateLimitStore): void {
  defaultStore = store;
}

/**
 * Resets the in-memory rate-limit store.
 * TEST USE ONLY — call in beforeAll/afterAll to prevent cross-suite contamination.
 * No-op when an Upstash Redis store is active (Redis TTLs self-expire).
 */
export function clearRateLimiterStore(): void {
  if (defaultStore instanceof MemoryRateLimitStore) {
    defaultStore.clear();
  }
}

/**
 * Resets the auth rate-limiter counter for a client after successful authentication.
 * Standard OWASP behavior: consecutive failed attempts are counted; successful auth resets the counter.
 */
export async function resetAuthRateLimit(req: Request): Promise<void> {
  const store = getDefaultRateLimitStore();
  const identifier = req.ip || req.socket.remoteAddress || '127.0.0.1';
  await store.reset?.(`ratelimit:auth:${identifier}`);
}

export interface RateLimiterOptions {
  windowMs: number;
  max: number;
  keyPrefix: string;
  keyGenerator?: (req: Request) => string;
  store?: RateLimitStore;
}

export function createRateLimiter(options: RateLimiterOptions) {
  const {
    windowMs,
    max,
    keyPrefix,
    keyGenerator = (req: Request) => req.ip || req.socket.remoteAddress || '127.0.0.1',
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
      // Fail open to avoid blocking traffic if rate limit backend is unavailable
      next();
    }
  };
}

export const authRateLimiter = createRateLimiter({
  windowMs: config.rateLimitWindowMsAuth,
  max: config.rateLimitMaxAuth,
  keyPrefix: 'ratelimit:auth',
  keyGenerator: (req: Request) => req.ip || req.socket.remoteAddress || '127.0.0.1',
});

export const mutationsRateLimiter = createRateLimiter({
  windowMs: config.rateLimitWindowMsMutations,
  max: config.rateLimitMaxMutations,
  keyPrefix: 'ratelimit:mutations',
  keyGenerator: (req: Request) =>
    req.user?.userId || req.ip || req.socket.remoteAddress || 'anonymous',
});

export const generalRateLimiter = createRateLimiter({
  windowMs: config.rateLimitWindowMsGeneral,
  max: config.rateLimitMaxGeneral,
  keyPrefix: 'ratelimit:general',
  keyGenerator: (req: Request) =>
    req.user?.userId || req.ip || req.socket.remoteAddress || 'anonymous',
});
