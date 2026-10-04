import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../app.js';
import { config } from '../config.js';
import { connectToDatabase, disconnectDatabase } from '../database/connection.js';
import { sessionRepository } from '../modules/auth/session.repository.js';
import { userRepository } from '../modules/users/user.repository.js';
import { generateAccessToken, hashPassword } from '../utils/crypto.js';

describe('Password-change gate is database authoritative', () => {
  const app = createApp();
  const USERNAME = 'gate.superadmin';
  const TEMP_PASSWORD = 'GateTempPassword123!';
  const NEW_PASSWORD = 'GateNewPassword456!';

  beforeAll(async () => {
    await connectToDatabase();
  });

  afterAll(async () => {
    await disconnectDatabase();
  });

  beforeEach(async () => {
    await userRepository.resetForTesting();
    await sessionRepository.resetForTesting();
    await userRepository.createUser({
      id: 'usr-gate-admin',
      fullName: 'Gate Administrator',
      username: USERNAME,
      employeeId: 'GATE-001',
      mobile: '9876543210',
      email: 'gate.admin@coldstorage.local',
      role: 'SUPER_ADMIN',
      facilityIds: [],
      status: 'ACTIVE',
      passwordHash: await hashPassword(TEMP_PASSWORD),
      mustChangePassword: true,
      lastLoginAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  });

  it('stale token with mustChangePassword=true does not block after DB is false', async () => {
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ username: USERNAME, password: TEMP_PASSWORD });
    expect(loginRes.status).toBe(200);
    const staleToken = loginRes.body.token as string;

    const changeRes = await request(app)
      .post('/api/auth/change-password')
      .set('Authorization', `Bearer ${staleToken}`)
      .send({ currentPassword: TEMP_PASSWORD, newPassword: NEW_PASSWORD });
    expect(changeRes.status).toBe(200);
    expect(changeRes.body.user.mustChangePassword).toBe(false);

    const persisted = await userRepository.findByUsername(USERNAME);
    expect(persisted?.mustChangePassword).toBe(false);

    // The pre-change access token still carries mustChangePassword=true, but the
    // gate must honor the database (false) and allow the request.
    const gated = await request(app)
      .get('/api/users')
      .set('Authorization', `Bearer ${staleToken}`);
    expect(gated.status).toBe(200);
  });

  it('fresh DB mustChangePassword=true blocks even when the token claims false', async () => {
    const forgedToken = generateAccessToken(
      {
        userId: 'usr-gate-admin',
        username: USERNAME,
        role: 'SUPER_ADMIN',
        facilityIds: [],
        mustChangePassword: false,
      },
      config.jwtSecret,
      900,
    );

    const gated = await request(app)
      .get('/api/users')
      .set('Authorization', `Bearer ${forgedToken}`);
    expect(gated.status).toBe(403);
    expect(gated.body.mustChangePassword).toBe(true);
  });

  it('restart bootstrap never overwrites an existing changed password', async () => {
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ username: USERNAME, password: TEMP_PASSWORD });
    const token = loginRes.body.token as string;
    await request(app)
      .post('/api/auth/change-password')
      .set('Authorization', `Bearer ${token}`)
      .send({ currentPassword: TEMP_PASSWORD, newPassword: NEW_PASSWORD });

    const before = await userRepository.findByUsername(USERNAME);
    process.env.BOOTSTRAP_ADMIN_USERNAME = USERNAME;
    process.env.BOOTSTRAP_ADMIN_PASSWORD = 'StaleBootstrapPassword999!';
    try {
      const second = await userRepository.bootstrapSuperAdminFromEnv();
      expect(second?.id).toBe(before?.id);
      const after = await userRepository.findByUsername(USERNAME);
      expect(after?.passwordHash).toBe(before?.passwordHash);
      expect(after?.mustChangePassword).toBe(false);
    } finally {
      delete process.env.BOOTSTRAP_ADMIN_USERNAME;
      delete process.env.BOOTSTRAP_ADMIN_PASSWORD;
    }
  });
});
