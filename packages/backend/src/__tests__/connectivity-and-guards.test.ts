import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../app.js';
import { config } from '../config.js';
import { connectToDatabase, disconnectDatabase } from '../database/connection.js';
import { createAuthSeeder } from './helpers/auth-fixtures.js';
import { UserModel } from '../database/models/user.model.js';

/**
 * Connectivity and configuration-introspection endpoints.
 *
 * `/health` stays a datastore-independent liveness probe for uptime monitoring. `/api/health`
 * exists because the frontend rewrite proxies only `/api/*`, so the browser cannot reach the
 * root path, and it reports the observed datastore state instead of assuming a connection.
 */
describe('Connectivity Endpoints', () => {
  const app = createApp();

  beforeAll(async () => {
    await connectToDatabase(
      process.env.MONGODB_URI ?? 'mongodb://127.0.0.1:27017/cold_storage_test',
    );
  });

  afterAll(async () => {
    await UserModel.deleteMany({ id: /^usr-health-/ });
    await disconnectDatabase();
  });

  it('serves an unauthenticated liveness probe at /health', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.service).toBe('cold-storage-backend');
  });

  it('reports the observed datastore state on /api/health without authentication', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.service).toBe('cold-storage-backend');
    expect(res.body.status).toBe('ok');
    expect(res.body.database.state).toBe('connected');
    expect(res.body.database.configured).toBe(true);
    expect(typeof res.body.checkedAt).toBe('string');
  });

  it('never leaks a datastore URI through the connectivity payload', async () => {
    const res = await request(app).get('/api/health');
    const serialized = JSON.stringify(res.body);
    expect(serialized).not.toContain('mongodb://');
    expect(serialized).not.toContain(config.mongoUri ?? 'mongodb://__unset__');
  });
});

/**
 * Privilege-escalation guards on user administration.
 *
 * Both paths previously allowed an installation to be left with no Super Admin: self-demotion
 * and mutual demotion.
 */
describe('Super Admin Tenancy Guards', () => {
  const app = createApp();
  const seedUser = createAuthSeeder(config.jwtSecret);

  let adminA: string;
  let operatorToken: string;

  beforeAll(async () => {
    await connectToDatabase(
      process.env.MONGODB_URI ?? 'mongodb://127.0.0.1:27017/cold_storage_test',
    );

    [{ token: adminA }, , { token: operatorToken }] = await Promise.all([
      seedUser({
        userId: 'usr-guard-admin-a',
        username: `guard.a.${randomUUID().slice(0, 6)}`,
        role: 'SUPER_ADMIN',
        facilityIds: [],
      }),
      seedUser({
        userId: 'usr-guard-admin-b',
        username: `guard.b.${randomUUID().slice(0, 6)}`,
        role: 'SUPER_ADMIN',
        facilityIds: [],
      }),
      seedUser({
        userId: 'usr-guard-operator',
        username: `guard.op.${randomUUID().slice(0, 6)}`,
        role: 'OPERATOR',
        facilityIds: [],
      }),
    ]);
  });

  afterAll(async () => {
    await UserModel.deleteMany({ id: /^usr-guard-/ });
    await disconnectDatabase();
  });

  it('refuses a Super Admin demoting themselves', async () => {
    const res = await request(app)
      .patch('/api/users/usr-guard-admin-a')
      .set('Authorization', `Bearer ${adminA}`)
      .send({ role: 'READ_ONLY' });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('own Super Admin authority');
  });

  it('refuses a Super Admin deactivating their own account', async () => {
    // Self-deactivation is refused at the route, before the service backstop runs.
    const res = await request(app)
      .patch('/api/users/usr-guard-admin-a')
      .set('Authorization', `Bearer ${adminA}`)
      .send({ status: 'DISABLED' });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('cannot disable their own account');
  });

  it('allows one Super Admin to demote another, since an admin always remains', async () => {
    const res = await request(app)
      .patch('/api/users/usr-guard-admin-b')
      .set('Authorization', `Bearer ${adminA}`)
      .send({ role: 'ADMIN' });
    expect(res.status).toBe(200);
    expect(res.body.user.role).toBe('ADMIN');
  });

  it('still denies non-Super Admins access to user administration', async () => {
    const res = await request(app)
      .get('/api/users')
      .set('Authorization', `Bearer ${operatorToken}`);
    expect(res.status).toBe(403);
    expect(res.body.error).toContain("Role 'OPERATOR' lacks permission 'user:manage'");
  });
});