import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../app.js';
import { connectToDatabase, disconnectDatabase } from '../database/connection.js';
import { authenticate } from '../middleware/auth.middleware.js';
import { requireFacilityScope } from '../middleware/facility.middleware.js';
import { createRateLimiter, MemoryRateLimitStore } from '../middleware/rate-limiter.middleware.js';
import { requirePermission } from '../middleware/rbac.middleware.js';
import { sessionRepository } from '../modules/auth/session.repository.js';
import { userRepository } from '../modules/users/user.repository.js';
import { hashPassword } from '../utils/crypto.js';

describe('Auth RBAC & Facility Scope Integration', () => {
  const app = createApp();

  const testLimiter = createRateLimiter({
    windowMs: 60000,
    max: 1000,
    keyPrefix: 'ratelimit:test-rbac',
    store: new MemoryRateLimitStore(),
  });

  app.get(
    '/test/facilities/:facilityId/scope-check',
    testLimiter,
    authenticate,
    requirePermission('storage:view'),
    requireFacilityScope((req) => req.params.facilityId),
    (req, res) => {
      res.status(200).json({ status: 'ok', user: req.user?.username });
    },
  );

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

  async function getActiveAdminToken(): Promise<string> {
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ username: TEST_ADMIN_USERNAME, password: TEST_ADMIN_PASSWORD });
    const tempToken = loginRes.body.token;

    const newPassword = 'ChangedAdminPassword123!';
    await request(app)
      .post('/api/auth/change-password')
      .set('Authorization', `Bearer ${tempToken}`)
      .send({
        currentPassword: TEST_ADMIN_PASSWORD,
        newPassword,
      });

    const activeLogin = await request(app)
      .post('/api/auth/login')
      .send({ username: TEST_ADMIN_USERNAME, password: newPassword });
    return activeLogin.body.token;
  }

  it('allows Super Admin to provision an Operator with temporary password, and enforces RBAC', async () => {
    const adminToken = await getActiveAdminToken();

    const createRes = await request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        fullName: 'Kishore Kumar',
        username: 'kishore.k',
        employeeId: 'EMP-2002',
        mobile: '9823456789',
        email: 'kishore@coldstorage.local',
        role: 'OPERATOR',
        facilityIds: ['facility-nashik-01'],
        temporaryPassword: 'TempPassword456!',
      });

    expect(createRes.status).toBe(201);
    expect(createRes.body.user.username).toBe('kishore.k');
    expect(createRes.body.user.mustChangePassword).toBe(true);

    const opLogin = await request(app)
      .post('/api/auth/login')
      .send({ username: 'kishore.k', password: 'TempPassword456!' });
    expect(opLogin.status).toBe(200);
    expect(opLogin.body.mustChangePassword).toBe(true);
    const tempOpToken = opLogin.body.token;

    await request(app)
      .post('/api/auth/change-password')
      .set('Authorization', `Bearer ${tempOpToken}`)
      .send({
        currentPassword: 'TempPassword456!',
        newPassword: 'PermPassword789!',
      });

    const activeOpLogin = await request(app)
      .post('/api/auth/login')
      .send({ username: 'kishore.k', password: 'PermPassword789!' });
    const opToken = activeOpLogin.body.token;

    const unauthorizedRes = await request(app)
      .get('/api/users')
      .set('Authorization', `Bearer ${opToken}`);

    expect(unauthorizedRes.status).toBe(403);
    expect(unauthorizedRes.body.error).toContain("Role 'OPERATOR' lacks permission 'user:manage'");
  });

  it('enforces facility-scoped authorization for assigned vs unassigned facilities', async () => {
    const adminToken = await getActiveAdminToken();

    await request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        fullName: 'Facility Operator',
        username: 'operator.north',
        employeeId: 'EMP-3001',
        mobile: '9811122233',
        email: 'operator.north@coldstorage.local',
        role: 'OPERATOR',
        facilityIds: ['facility-north'],
        temporaryPassword: 'TempPassword789!',
      });

    const opLogin = await request(app)
      .post('/api/auth/login')
      .send({ username: 'operator.north', password: 'TempPassword789!' });
    const opToken = opLogin.body.token;

    const permitRes = await request(app)
      .get('/test/facilities/facility-north/scope-check')
      .set('Authorization', `Bearer ${opToken}`);
    expect(permitRes.status).toBe(200);

    const denyRes = await request(app)
      .get('/test/facilities/facility-south/scope-check')
      .set('Authorization', `Bearer ${opToken}`);
    expect(denyRes.status).toBe(403);
    expect(denyRes.body.error).toContain('not authorized to access facility');

    const adminPermitRes = await request(app)
      .get('/test/facilities/facility-south/scope-check')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(adminPermitRes.status).toBe(200);
  });
});
