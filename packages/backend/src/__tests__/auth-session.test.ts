import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../app.js';
import { connectToDatabase, disconnectDatabase } from '../database/connection.js';
import { sessionRepository } from '../modules/auth/session.repository.js';
import { userRepository } from '../modules/users/user.repository.js';
import { hashPassword, verifyPassword } from '../utils/crypto.js';

describe('Auth & Session Integration', () => {
  const app = createApp();

  const TEST_ADMIN_USERNAME = 'test.admin';
  const TEST_ADMIN_PASSWORD = 'TestAdminPassword123!';

  beforeAll(async () => {
    await connectToDatabase('mongodb://127.0.0.1:27017/cold_storage_test');
  });

  afterAll(async () => {
    await disconnectDatabase();
  });

  beforeEach(async () => {
    await userRepository.resetForTesting();
    await sessionRepository.resetForTesting();

    await userRepository.createUser({
      id: 'test-admin-id',
      fullName: 'Test Administrator',
      username: TEST_ADMIN_USERNAME,
      employeeId: 'T-ADM-001',
      mobile: '9876543210',
      email: 'test.admin@coldstorage.local',
      role: 'SUPER_ADMIN',
      facilityIds: ['facility-primary'],
      status: 'ACTIVE',
      passwordHash: await hashPassword(TEST_ADMIN_PASSWORD),
      mustChangePassword: true,
      lastLoginAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  });

  it('uses Argon2id for password hashing and verification', async () => {
    const rawPassword = 'SecureSecretPasswordArgon2id!';
    const hash = await hashPassword(rawPassword);

    expect(hash).toContain('$argon2id$');
    expect(await verifyPassword(rawPassword, hash)).toBe(true);
    expect(await verifyPassword('WrongPassword', hash)).toBe(false);
  });

  it('responds with health check status', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });

  it('performs Super Admin initial login with temporary password and forces password change', async () => {
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ username: TEST_ADMIN_USERNAME, password: TEST_ADMIN_PASSWORD });

    expect(loginRes.status).toBe(200);
    expect(loginRes.body.token).toBeDefined();
    expect(loginRes.body.mustChangePassword).toBe(true);

    const cookies = loginRes.headers['set-cookie'];
    expect(cookies).toBeDefined();
    expect(cookies[0]).toContain('refreshToken=');
    expect(cookies[0]).toContain('HttpOnly');

    const token = loginRes.body.token;

    const blockedRes = await request(app)
      .get('/api/users')
      .set('Authorization', `Bearer ${token}`);
    expect(blockedRes.status).toBe(403);
    expect(blockedRes.body.error).toContain('Password change is required');

    const newPassword = 'NewSuperAdminPassword456!';
    const changeRes = await request(app)
      .post('/api/auth/change-password')
      .set('Authorization', `Bearer ${token}`)
      .send({
        currentPassword: TEST_ADMIN_PASSWORD,
        newPassword,
      });

    expect(changeRes.status).toBe(200);
    expect(changeRes.body.success).toBe(true);
    expect(changeRes.body.user.mustChangePassword).toBe(false);

    const failRes = await request(app)
      .post('/api/auth/login')
      .send({ username: TEST_ADMIN_USERNAME, password: TEST_ADMIN_PASSWORD });
    expect(failRes.status).toBe(401);

    const newLoginRes = await request(app)
      .post('/api/auth/login')
      .send({ username: TEST_ADMIN_USERNAME, password: newPassword });
    expect(newLoginRes.status).toBe(200);
    expect(newLoginRes.body.mustChangePassword).toBe(false);

    const allowedRes = await request(app)
      .get('/api/users')
      .set('Authorization', `Bearer ${newLoginRes.body.token}`);
    expect(allowedRes.status).toBe(200);
  });

  it('supports rotating refresh tokens and session revocation on logout', async () => {
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ username: TEST_ADMIN_USERNAME, password: TEST_ADMIN_PASSWORD });

    const cookieHeader = loginRes.headers['set-cookie'][0];
    const refreshToken = cookieHeader.split(';')[0].replace('refreshToken=', '');

    const refreshRes = await request(app)
      .post('/api/auth/refresh')
      .set('Cookie', [`refreshToken=${refreshToken}`]);

    expect(refreshRes.status).toBe(200);
    expect(refreshRes.body.token).toBeDefined();

    const newCookieHeader = refreshRes.headers['set-cookie'][0];
    const newRefreshToken = newCookieHeader.split(';')[0].replace('refreshToken=', '');
    expect(newRefreshToken).not.toBe(refreshToken);

    const replayRes = await request(app)
      .post('/api/auth/refresh')
      .set('Cookie', [`refreshToken=${refreshToken}`]);
    expect(replayRes.status).toBe(401);

    const logoutRes = await request(app)
      .post('/api/auth/logout')
      .set('Cookie', [`refreshToken=${newRefreshToken}`]);
    expect(logoutRes.status).toBe(200);

    const postLogoutRefresh = await request(app)
      .post('/api/auth/refresh')
      .set('Cookie', [`refreshToken=${newRefreshToken}`]);
    expect(postLogoutRefresh.status).toBe(401);
  });

  it('rejects invalid credentials and unauthenticated requests', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'nonexistent', password: 'wrong' });
    expect(res.status).toBe(401);

    const noAuth = await request(app).get('/api/auth/me');
    expect(noAuth.status).toBe(401);
  });
});
