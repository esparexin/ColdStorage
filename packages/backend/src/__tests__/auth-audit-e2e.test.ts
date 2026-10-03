import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../app.js';
import { connectToDatabase, disconnectDatabase } from '../database/connection.js';
import { authenticate } from '../middleware/auth.middleware.js';
import { requireFacilityScope } from '../middleware/facility.middleware.js';
import { requirePermission } from '../middleware/rbac.middleware.js';
import { sessionRepository } from '../modules/auth/session.repository.js';
import { userRepository } from '../modules/users/user.repository.js';

describe('Auth Audit E2E Flow', () => {
  const app = createApp();

  app.get(
    '/test/facilities/:facilityId/scope-check',
    authenticate,
    requirePermission('storage:view'),
    requireFacilityScope((req) => req.params.facilityId),
    (req, res) => {
      res.status(200).json({ status: 'ok', user: req.user?.username });
    },
  );

  beforeAll(async () => {
    await connectToDatabase('mongodb://127.0.0.1:27017/cold_storage_test');
  });

  afterAll(async () => {
    await disconnectDatabase();
  });

  beforeEach(async () => {
    await userRepository.resetForTesting();
    await sessionRepository.resetForTesting();
  });

  it('passes comprehensive 16-step end-to-end audit verification', async () => {
    process.env.BOOTSTRAP_ADMIN_USERNAME = 'bootstrap.superadmin';
    process.env.BOOTSTRAP_ADMIN_PASSWORD = 'BootstrapSecretPassword999!';
    const bootstrapped = await userRepository.bootstrapSuperAdminFromEnv();
    expect(bootstrapped).not.toBeNull();
    expect(bootstrapped?.username).toBe('bootstrap.superadmin');

    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ username: 'bootstrap.superadmin', password: 'BootstrapSecretPassword999!' });
    expect(loginRes.status).toBe(200);
    expect(loginRes.body.mustChangePassword).toBe(true);
    const initialToken = loginRes.body.token;

    const blockedRes = await request(app)
      .get('/api/users')
      .set('Authorization', `Bearer ${initialToken}`);
    expect(blockedRes.status).toBe(403);
    expect(blockedRes.body.error).toContain('Password change is required');

    const newAdminPass = 'PostBootstrapSecuredPass123!';
    const changeRes = await request(app)
      .post('/api/auth/change-password')
      .set('Authorization', `Bearer ${initialToken}`)
      .send({
        currentPassword: 'BootstrapSecretPassword999!',
        newPassword: newAdminPass,
      });
    expect(changeRes.status).toBe(200);
    expect(changeRes.body.user.mustChangePassword).toBe(false);

    const postChangeLogin = await request(app)
      .post('/api/auth/login')
      .send({ username: 'bootstrap.superadmin', password: newAdminPass });
    expect(postChangeLogin.status).toBe(200);
    expect(postChangeLogin.body.mustChangePassword).toBe(false);
    const activeAdminToken = postChangeLogin.body.token;

    const unblockedRes = await request(app)
      .get('/api/users')
      .set('Authorization', `Bearer ${activeAdminToken}`);
    expect(unblockedRes.status).toBe(200);

    const createUserRes = await request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${activeAdminToken}`)
      .send({
        fullName: 'Scoped Operator User',
        username: 'scoped.operator',
        employeeId: 'EMP-9009',
        mobile: '9800011122',
        email: 'scoped.op@coldstorage.local',
        role: 'OPERATOR',
        facilityIds: ['facility-nashik-cold'],
        temporaryPassword: 'TempPasswordScoped123!',
      });
    expect(createUserRes.status).toBe(201);
    expect(createUserRes.body.user.facilityIds).toEqual(['facility-nashik-cold']);

    const opLoginRes = await request(app)
      .post('/api/auth/login')
      .send({ username: 'scoped.operator', password: 'TempPasswordScoped123!' });
    expect(opLoginRes.status).toBe(200);
    const opToken = opLoginRes.body.token;
    const opCookieHeader = opLoginRes.headers['set-cookie'][0];
    const opRefreshToken = opCookieHeader.split(';')[0].replace('refreshToken=', '');

    const permitRes = await request(app)
      .get('/test/facilities/facility-nashik-cold/scope-check')
      .set('Authorization', `Bearer ${opToken}`);
    expect(permitRes.status).toBe(200);

    const denyRes = await request(app)
      .get('/test/facilities/facility-pune-cold/scope-check')
      .set('Authorization', `Bearer ${opToken}`);
    expect(denyRes.status).toBe(403);
    expect(denyRes.body.error).toContain('not authorized to access facility');

    const refreshRes = await request(app)
      .post('/api/auth/refresh')
      .set('Cookie', [`refreshToken=${opRefreshToken}`]);
    expect(refreshRes.status).toBe(200);
    expect(refreshRes.body.token).toBeDefined();

    const newOpCookieHeader = refreshRes.headers['set-cookie'][0];
    const rotatedRefreshToken = newOpCookieHeader.split(';')[0].replace('refreshToken=', '');
    expect(rotatedRefreshToken).not.toBe(opRefreshToken);

    const reuseRes = await request(app)
      .post('/api/auth/refresh')
      .set('Cookie', [`refreshToken=${opRefreshToken}`]);
    expect(reuseRes.status).toBe(401);

    const logoutRes = await request(app)
      .post('/api/auth/logout')
      .set('Cookie', [`refreshToken=${rotatedRefreshToken}`]);
    expect(logoutRes.status).toBe(200);

    const postLogoutRefresh = await request(app)
      .post('/api/auth/refresh')
      .set('Cookie', [`refreshToken=${rotatedRefreshToken}`]);
    expect(postLogoutRefresh.status).toBe(401);

    const persistedAdmin = await userRepository.findByUsername('bootstrap.superadmin');
    expect(persistedAdmin?.passwordHash).not.toContain('BootstrapSecretPassword999!');
    expect(persistedAdmin?.passwordHash).toContain('$argon2id$');
    const persistedOp = await userRepository.findByUsername('scoped.operator');
    expect(persistedOp?.passwordHash).not.toContain('TempPasswordScoped123!');
    expect(persistedOp?.passwordHash).toContain('$argon2id$');

    delete process.env.BOOTSTRAP_ADMIN_USERNAME;
    delete process.env.BOOTSTRAP_ADMIN_PASSWORD;
  });
});
