import type { Request, Response } from 'express';
import mongoose from 'mongoose';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../app.js';
import { config } from '../config.js';
import { connectToDatabase, disconnectDatabase } from '../database/connection.js';
import { AuditLogModel } from '../database/models/audit-log.model.js';
import {
  clearRateLimiterStore,
  createRateLimiter,
  MemoryRateLimitStore,
  setDefaultRateLimitStore,
} from '../middleware/rate-limiter.middleware.js';
import { createAuthSeeder } from './helpers/auth-fixtures.js';

const app = createApp();

describe('Phase 11: Multi-Tiered Rate Limiting & Audit Security Controls', () => {
  let superAdminToken: string;

  const seed = createAuthSeeder(config.jwtSecret);

  beforeAll(async () => {
    await connectToDatabase();

    ({ token: superAdminToken } = await seed({
      userId: 'usr-rate-superadmin',
      username: 'superadmin_rate',
      role: 'SUPER_ADMIN',
      facilityIds: [],
      expiresInSeconds: 3600,
    }));
  });

  afterAll(async () => {
    // Clear rate-limit store so subsequent test files start clean
    clearRateLimiterStore();
    await disconnectDatabase();
  });

  beforeEach(async () => {
    // Reset rate limiter store and audit logs
    const store = new MemoryRateLimitStore();
    setDefaultRateLimitStore(store);
    await mongoose.connection.collection('auditlogs').deleteMany({});
  });

  it('1. enforces strict Tier 1 rate limit on /api/auth/login (returns HTTP 429 on exceeding limit)', async () => {
    // Tier 1 allows 10 requests by default
    for (let i = 0; i < 10; i++) {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ username: 'test', password: 'pwd' });
      expect(res.status).not.toBe(429);
    }

    const throttledRes = await request(app)
      .post('/api/auth/login')
      .send({ username: 'test', password: 'pwd' });
    expect(throttledRes.status).toBe(429);
  });

  it('2. emits standardized RateLimit-Limit, RateLimit-Remaining, and RateLimit-Reset headers', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'test', password: 'pwd' });
    expect(res.headers['ratelimit-limit']).toBe('10');
    expect(res.headers['ratelimit-remaining']).toBe('9');
    expect(res.headers['ratelimit-reset']).toBeDefined();
    expect(Number(res.headers['ratelimit-reset'])).toBeGreaterThan(0);
  });

  it('3. returns Retry-After header and error message on throttled response', async () => {
    for (let i = 0; i < 10; i++) {
      await request(app).post('/api/auth/login').send({ username: 'test', password: 'pwd' });
    }

    const throttledRes = await request(app)
      .post('/api/auth/login')
      .send({ username: 'test', password: 'pwd' });
    expect(throttledRes.status).toBe(429);
    expect(throttledRes.headers['retry-after']).toBeDefined();
    expect(Number(throttledRes.headers['retry-after'])).toBeGreaterThan(0);
    expect(throttledRes.body.error).toContain('TOO_MANY_REQUESTS');
    expect(throttledRes.body.retryAfterSeconds).toBeDefined();
  });

  it('4. enforces Tier 2 rate limit on /api/backups/trigger and bulk CSV import routes', async () => {
    // Tier 2 allows 5 requests by default
    for (let i = 0; i < 5; i++) {
      const res = await request(app)
        .post('/api/backups/trigger')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({ backupType: 'MANUAL' });
      // Should not be 429
      expect(res.status).not.toBe(429);
    }

    const throttledRes = await request(app)
      .post('/api/backups/trigger')
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({ backupType: 'MANUAL' });
    expect(throttledRes.status).toBe(429);
  }, 15000);

  it('5. verifies window reset allows new requests after cooldown', async () => {
    const shortWindowStore = new MemoryRateLimitStore();
    const shortWindowLimiter = createRateLimiter({
      windowMs: 50, // 50ms cooldown
      max: 2,
      keyPrefix: 'ratelimit:test',
      store: shortWindowStore,
    });

    const mockReq = { ip: '127.0.0.1', headers: {} } as unknown as Request;
    let statusSet = 200;
    const mockRes = {
      setHeader: () => {},
      status: (s: number) => {
        statusSet = s;
        return { json: () => {} };
      },
    } as unknown as Response;
    const nextFn = () => {
      statusSet = 200;
    };

    // First 2 requests within quota
    await shortWindowLimiter(mockReq, mockRes, nextFn);
    expect(statusSet).toBe(200);
    await shortWindowLimiter(mockReq, mockRes, nextFn);
    expect(statusSet).toBe(200);

    // 3rd request throttled
    await shortWindowLimiter(mockReq, mockRes, nextFn);
    expect(statusSet).toBe(429);

    // Wait 60ms for cooldown window to expire
    await new Promise((resolve) => setTimeout(resolve, 60));

    // Request after cooldown succeeds
    await shortWindowLimiter(mockReq, mockRes, nextFn);
    expect(statusSet).toBe(200);
  });

  it('6. emits ACCESS_DENIED audit event with severity SECURITY when rate limit is exceeded', async () => {
    for (let i = 0; i < 10; i++) {
      await request(app).post('/api/auth/login').send({ username: 'test', password: 'pwd' });
    }

    // 11th request triggers rate limit breach
    await request(app).post('/api/auth/login').send({ username: 'test', password: 'pwd' });

    // Verify audit log emitted (fire-and-forget — allow async write to settle)
    await new Promise((r) => setTimeout(r, 500));
    const auditLogs = await AuditLogModel.find({
      eventType: 'ACCESS_DENIED',
      severity: 'SECURITY',
      resource: 'rate-limiter',
    });

    expect(auditLogs.length).toBeGreaterThan(0);
    expect(auditLogs[0].eventType).toBe('ACCESS_DENIED');
    expect(auditLogs[0].severity).toBe('SECURITY');
    expect(auditLogs[0].details).toHaveProperty('retryAfterSeconds');
  });
});
