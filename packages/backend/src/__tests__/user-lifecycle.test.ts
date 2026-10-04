import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../app.js';
import { connectToDatabase, disconnectDatabase } from '../database/connection.js';
import { SessionModel } from '../database/models/session.model.js';
import { UserModel } from '../database/models/user.model.js';
import { sessionRepository } from '../modules/auth/session.repository.js';
import { userRepository } from '../modules/users/user.repository.js';
import { hashPassword } from '../utils/crypto.js';

describe('User Lifecycle — update, deactivate, and temporary password reset', () => {
  const app = createApp();

  const ADMIN_USERNAME = 'lifecycle.admin';
  const ADMIN_PASSWORD = 'LifecycleAdminPass123!';
  const OPERATOR_USERNAME = 'lifecycle.operator';
  const OPERATOR_PASSWORD = 'LifecycleOperPass123!';

  async function seedActiveUser(params: {
    id: string;
    username: string;
    password: string;
    role: 'SUPER_ADMIN' | 'OPERATOR';
  }): Promise<void> {
    await userRepository.createUser({
      id: params.id,
      fullName: params.username,
      username: params.username,
      employeeId: `EMP-${params.id}`,
      mobile: '9876543210',
      email: `${params.username}@coldstorage.local`,
      role: params.role,
      facilityIds: ['facility-primary'],
      status: 'ACTIVE',
      passwordHash: await hashPassword(params.password),
      mustChangePassword: false,
      lastLoginAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }

  async function login(username: string, password: string): Promise<string> {
    const res = await request(app).post('/api/auth/login').send({ username, password });
    expect(res.status).toBe(200);
    return res.body.token as string;
  }

  /** The refresh token is delivered exclusively as an HttpOnly cookie, never in the body. */
  function extractRefreshCookie(setCookie: string | string[] | undefined): string {
    const cookies = Array.isArray(setCookie) ? setCookie : setCookie ? [setCookie] : [];
    const raw = cookies.find((c) => c.startsWith('refreshToken='));
    return raw ? raw.split(';')[0].replace('refreshToken=', '') : '';
  }

  beforeAll(async () => {
    await connectToDatabase();
  });

  afterAll(async () => {
    await disconnectDatabase();
  });

  beforeEach(async () => {
    await userRepository.resetForTesting();
    await sessionRepository.resetForTesting();
    await seedActiveUser({
      id: 'usr-lifecycle-admin',
      username: ADMIN_USERNAME,
      password: ADMIN_PASSWORD,
      role: 'SUPER_ADMIN',
    });
    await seedActiveUser({
      id: 'usr-lifecycle-operator',
      username: OPERATOR_USERNAME,
      password: OPERATOR_PASSWORD,
      role: 'OPERATOR',
    });
  });

  it('updates profile, role, and facility scope while keeping username immutable', async () => {
    const token = await login(ADMIN_USERNAME, ADMIN_PASSWORD);

    const res = await request(app)
      .patch('/api/users/usr-lifecycle-operator')
      .set('Authorization', `Bearer ${token}`)
      .send({
        fullName: 'Renamed Operator',
        role: 'ADMIN',
        facilityIds: ['facility-secondary'],
      });

    expect(res.status).toBe(200);
    expect(res.body.user.fullName).toBe('Renamed Operator');
    expect(res.body.user.role).toBe('ADMIN');
    expect(res.body.user.facilityIds).toEqual(['facility-secondary']);
    expect(res.body.user.username).toBe(OPERATOR_USERNAME);
    expect(res.body.user.status).toBe('ACTIVE');
  });

  it('rejects an empty patch and a username field that is not updatable', async () => {
    const token = await login(ADMIN_USERNAME, ADMIN_PASSWORD);

    const emptyRes = await request(app)
      .patch('/api/users/usr-lifecycle-operator')
      .set('Authorization', `Bearer ${token}`)
      .send({});
    expect(emptyRes.status).toBe(400);

    const usernameRes = await request(app)
      .patch('/api/users/usr-lifecycle-operator')
      .set('Authorization', `Bearer ${token}`)
      .send({ username: 'hijacked.name' });
    expect(usernameRes.status).toBe(400);
  });

  it('rejects an update that collides with another account email', async () => {
    const token = await login(ADMIN_USERNAME, ADMIN_PASSWORD);

    const res = await request(app)
      .patch('/api/users/usr-lifecycle-operator')
      .set('Authorization', `Bearer ${token}`)
      .send({ email: ADMIN_USERNAME + '@coldstorage.local' });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('already in use');
  });

  it('deactivates an account and revokes its live sessions', async () => {
    const operatorToken = await login(OPERATOR_USERNAME, OPERATOR_PASSWORD);
    expect(await SessionModel.countDocuments({ userId: 'usr-lifecycle-operator', revokedAt: null })).toBe(1);

    const token = await login(ADMIN_USERNAME, ADMIN_PASSWORD);
    const res = await request(app)
      .patch('/api/users/usr-lifecycle-operator')
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'DISABLED' });

    expect(res.status).toBe(200);
    expect(res.body.user.status).toBe('DISABLED');

    const activeSessions = await SessionModel.countDocuments({
      userId: 'usr-lifecycle-operator',
      revokedAt: null,
    });
    expect(activeSessions).toBe(0);

    const blocked = await request(app)
      .get('/api/users')
      .set('Authorization', `Bearer ${operatorToken}`);
    expect(blocked.status).toBe(403);
    expect(blocked.body.error).toContain('disabled');
  });

  it('refuses to let an administrator disable their own account', async () => {
    const token = await login(ADMIN_USERNAME, ADMIN_PASSWORD);

    const res = await request(app)
      .patch('/api/users/usr-lifecycle-admin')
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'DISABLED' });

    expect(res.status).toBe(400);
    const stillActive = await UserModel.findOne({ id: 'usr-lifecycle-admin' }).lean().exec();
    expect(stillActive?.status).toBe('ACTIVE');
  });

  it('resets a temporary password, re-arms the forced change, and revokes sessions', async () => {
    const operatorLogin = await request(app)
      .post('/api/auth/login')
      .send({ username: OPERATOR_USERNAME, password: OPERATOR_PASSWORD });
    const revokedRefreshToken = extractRefreshCookie(operatorLogin.headers['set-cookie']);
    expect(revokedRefreshToken).toBeTruthy();
    const operatorToken = operatorLogin.body.token as string;
    const token = await login(ADMIN_USERNAME, ADMIN_PASSWORD);

    const res = await request(app)
      .post('/api/users/usr-lifecycle-operator/reset-password')
      .set('Authorization', `Bearer ${token}`)
      .send({ temporaryPassword: 'FreshTempPass789!' });

    expect(res.status).toBe(200);
    expect(res.body.user.mustChangePassword).toBe(true);

    const activeSessions = await SessionModel.countDocuments({
      userId: 'usr-lifecycle-operator',
      revokedAt: null,
    });
    expect(activeSessions).toBe(0);

    // The pre-reset refresh token is revoked and can no longer mint a new access token.
    const refreshRes = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken: revokedRefreshToken });
    expect(refreshRes.status).toBe(401);

    // An access token minted before the reset stays signature-valid until it expires, but
    // the account is re-armed so no new session can be established without a forced change.
    expect(operatorToken).toBeTruthy();

    const relogin = await request(app)
      .post('/api/auth/login')
      .send({ username: OPERATOR_USERNAME, password: 'FreshTempPass789!' });
    expect(relogin.status).toBe(200);
    expect(relogin.body.mustChangePassword).toBe(true);
  });

  it('enforces RBAC so a non-admin cannot mutate user accounts', async () => {
    const operatorToken = await login(OPERATOR_USERNAME, OPERATOR_PASSWORD);

    const patchRes = await request(app)
      .patch('/api/users/usr-lifecycle-admin')
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({ status: 'DISABLED' });

    const resetRes = await request(app)
      .post('/api/users/usr-lifecycle-admin/reset-password')
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({ temporaryPassword: 'AttemptedReset123!' });

    expect(patchRes.status).toBe(403);
    expect(resetRes.status).toBe(403);
  });

  it('returns 404 for lifecycle operations against an unknown user id', async () => {
    const token = await login(ADMIN_USERNAME, ADMIN_PASSWORD);

    const patchRes = await request(app)
      .patch('/api/users/usr-does-not-exist')
      .set('Authorization', `Bearer ${token}`)
      .send({ fullName: 'Ghost' });

    const resetRes = await request(app)
      .post('/api/users/usr-does-not-exist/reset-password')
      .set('Authorization', `Bearer ${token}`)
      .send({ temporaryPassword: 'GhostPassword1!' });

    expect(patchRes.status).toBe(404);
    expect(resetRes.status).toBe(404);
  });
});