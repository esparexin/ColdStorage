import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../app.js';

const app = createApp();

describe('Phase 11: Security Headers & OWASP Hardening Controls', () => {
  it('1. sets standard OWASP security headers on all API responses', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.headers['x-frame-options']).toBe('DENY');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
  });

  it('2. configures appropriate CSP blocking unauthorized framing and object embeddings', async () => {
    const res = await request(app).get('/health');
    const csp = res.headers['content-security-policy'];
    expect(csp).toBeDefined();
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("frame-ancestors 'none'");
  });

  it('3. rejects oversized JSON request bodies (> 1 MB) with HTTP 413 Payload Too Large', async () => {
    // Generate an oversized string > 1 MB
    const largeString = 'x'.repeat(1024 * 1024 + 100);
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'admin', password: largeString })
      .set('Content-Type', 'application/json');

    expect(res.status).toBe(413);
    expect(res.body.error).toContain('PAYLOAD_TOO_LARGE');
  });

  it('4. rejects NoSQL operator injection in request body with HTTP 400 ($where, $ne, $gt)', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({
        username: { $ne: 'admin' },
        password: 'password123',
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('INVALID_INPUT_KEYS');
  });

  it('5. rejects NoSQL operator injection in query string with HTTP 400', async () => {
    const res = await request(app).get('/api/backups?status[$ne]=COMPLETED');

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('INVALID_INPUT_KEYS');
  });

  it('6. rejects HTTP Parameter Pollution (duplicate array query parameter where scalar expected)', async () => {
    const res = await request(app).get('/api/backups?status=COMPLETED&status=FAILED');

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('PARAMETER_POLLUTION');
  });
});
