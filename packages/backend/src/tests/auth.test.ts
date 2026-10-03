import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../app.js';
import { connectToDatabase, disconnectDatabase } from '../database/connection.js';
import { authenticate } from '../middleware/auth.middleware.js';
import { requireFacilityScope } from '../middleware/facility.middleware.js';
import { requirePermission } from '../middleware/rbac.middleware.js';
import { sessionRepository } from '../modules/auth/session.repository.js';
import { userRepository } from '../modules/users/user.repository.js';
import { hashPassword, verifyPassword } from '../utils/crypto.js';

describe('P2 Auth + Users + RBAC Integration', () => {
  const app = createApp();

  // Attach a test-scoped route strictly for testing facility authorization middleware without polluting production routes
  app.get(
    '/test/facilities/:facilityId/scope-check',
    authenticate,
    requirePermission('storage:view'),
    requireFacilityScope((req) => req.params.facilityId),
    (req, res) => {
      res.status(200).json({ status: 'ok', user: req.user?.username });
    },
  );

  // Test-specific credentials isolated exclusively to test scope
  const TEST_ADMIN_USERNAME = 'test.admin';
  const TEST_ADMIN_PASSWORD = 'TestAdminPassword123!';

  beforeAll(async () => {
    // Attempt local database connection if running
    await connectToDatabase('mongodb://127.0.0.1:27017/cold_storage_test');
  });

  afterAll(async () => {
    await disconnectDatabase();
  });

  beforeEach(async () => {
    await userRepository.resetForTesting();
    await sessionRepository.resetForTesting();

    // Explicitly seed the test administrator in the test fixture
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

  // Helper to obtain an active admin token with password change completed
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

  it('uses Argon2id for password hashing and verification', async () => {
    const rawPassword = 'SecureSecretPasswordArgon2id!';
    const hash = await hashPassword(rawPassword);

    expect(hash).toContain('$argon2id$'); // Confirms Argon2id format
    expect(await verifyPassword(rawPassword, hash)).toBe(true);
    expect(await verifyPassword('WrongPassword', hash)).toBe(false);
  });

  it('responds with health check status', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });

  it('performs Super Admin initial login with temporary password and forces password change', async () => {
    // 1. Initial login
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ username: TEST_ADMIN_USERNAME, password: TEST_ADMIN_PASSWORD });

    expect(loginRes.status).toBe(200);
    expect(loginRes.body.token).toBeDefined();
    expect(loginRes.body.mustChangePassword).toBe(true);

    // Verify secure HTTP-only refresh cookie was set
    const cookies = loginRes.headers['set-cookie'];
    expect(cookies).toBeDefined();
    expect(cookies[0]).toContain('refreshToken=');
    expect(cookies[0]).toContain('HttpOnly');

    const token = loginRes.body.token;

    // Protected operation is blocked while mustChangePassword is true
    const blockedRes = await request(app)
      .get('/api/users')
      .set('Authorization', `Bearer ${token}`);
    expect(blockedRes.status).toBe(403);
    expect(blockedRes.body.error).toContain('Password change is required');

    // 2. Change password
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

    // 3. Old password must fail
    const failRes = await request(app)
      .post('/api/auth/login')
      .send({ username: TEST_ADMIN_USERNAME, password: TEST_ADMIN_PASSWORD });
    expect(failRes.status).toBe(401);

    // 4. New password succeeds and mustChangePassword is false
    const newLoginRes = await request(app)
      .post('/api/auth/login')
      .send({ username: TEST_ADMIN_USERNAME, password: newPassword });
    expect(newLoginRes.status).toBe(200);
    expect(newLoginRes.body.mustChangePassword).toBe(false);

    // Protected operation is now allowed
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

    // 1. Refresh token rotation
    const refreshRes = await request(app)
      .post('/api/auth/refresh')
      .set('Cookie', [`refreshToken=${refreshToken}`]);

    expect(refreshRes.status).toBe(200);
    expect(refreshRes.body.token).toBeDefined();

    const newCookieHeader = refreshRes.headers['set-cookie'][0];
    const newRefreshToken = newCookieHeader.split(';')[0].replace('refreshToken=', '');
    expect(newRefreshToken).not.toBe(refreshToken); // Must be rotated

    // 2. Old refresh token cannot be reused
    const replayRes = await request(app)
      .post('/api/auth/refresh')
      .set('Cookie', [`refreshToken=${refreshToken}`]);
    expect(replayRes.status).toBe(401);

    // 3. Logout revokes active session
    const logoutRes = await request(app)
      .post('/api/auth/logout')
      .set('Cookie', [`refreshToken=${newRefreshToken}`]);
    expect(logoutRes.status).toBe(200);

    // 4. Revoked token fails
    const postLogoutRefresh = await request(app)
      .post('/api/auth/refresh')
      .set('Cookie', [`refreshToken=${newRefreshToken}`]);
    expect(postLogoutRefresh.status).toBe(401);
  });

  it('allows Super Admin to provision an Operator with temporary password, and enforces RBAC', async () => {
    const adminToken = await getActiveAdminToken();

    // Provision Operator
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

    // Operator logs in with temporary password
    const opLogin = await request(app)
      .post('/api/auth/login')
      .send({ username: 'kishore.k', password: 'TempPassword456!' });
    expect(opLogin.status).toBe(200);
    expect(opLogin.body.mustChangePassword).toBe(true);
    const tempOpToken = opLogin.body.token;

    // Operator changes password
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

    // Operator attempts to access user:manage route (should be 403 Forbidden by RBAC)
    const unauthorizedRes = await request(app)
      .get('/api/users')
      .set('Authorization', `Bearer ${opToken}`);

    expect(unauthorizedRes.status).toBe(403);
    expect(unauthorizedRes.body.error).toContain("Role 'OPERATOR' lacks permission 'user:manage'");
  });

  it('enforces facility-scoped authorization for assigned vs unassigned facilities', async () => {
    const adminToken = await getActiveAdminToken();

    // Provision Operator scoped only to facility-north
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

    // Operator accesses assigned facility -> 200 OK
    const permitRes = await request(app)
      .get('/test/facilities/facility-north/scope-check')
      .set('Authorization', `Bearer ${opToken}`);
    expect(permitRes.status).toBe(200);

    // Operator attempts to access unassigned facility -> 403 Forbidden
    const denyRes = await request(app)
      .get('/test/facilities/facility-south/scope-check')
      .set('Authorization', `Bearer ${opToken}`);
    expect(denyRes.status).toBe(403);
    expect(denyRes.body.error).toContain('not authorized to access facility');

    // Super Admin accesses facility-south -> 200 OK (Super Admin has global facility scope)
    const adminPermitRes = await request(app)
      .get('/test/facilities/facility-south/scope-check')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(adminPermitRes.status).toBe(200);
  });

  it('rejects invalid credentials and unauthenticated requests', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'nonexistent', password: 'wrong' });
    expect(res.status).toBe(401);

    const noAuth = await request(app).get('/api/auth/me');
    expect(noAuth.status).toBe(401);
  });

  it('passes comprehensive 16-step end-to-end audit verification', async () => {
    // 1. Bootstrap Super Admin using environment credentials
    process.env.BOOTSTRAP_ADMIN_USERNAME = 'bootstrap.superadmin';
    process.env.BOOTSTRAP_ADMIN_PASSWORD = 'BootstrapSecretPassword999!';
    const bootstrapped = await userRepository.bootstrapSuperAdminFromEnv();
    expect(bootstrapped).not.toBeNull();
    expect(bootstrapped?.username).toBe('bootstrap.superadmin');

    // 2. Login
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ username: 'bootstrap.superadmin', password: 'BootstrapSecretPassword999!' });
    expect(loginRes.status).toBe(200);

    // 3. Confirm mustChangePassword
    expect(loginRes.body.mustChangePassword).toBe(true);
    const initialToken = loginRes.body.token;

    // 4. Confirm protected operation is blocked
    const blockedRes = await request(app)
      .get('/api/users')
      .set('Authorization', `Bearer ${initialToken}`);
    expect(blockedRes.status).toBe(403);
    expect(blockedRes.body.error).toContain('Password change is required');

    // 5. Change password
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

    // 6. Confirm protected operation becomes available
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

    // 7. Create a test user with facility scope
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

    // 8. Login as that user
    const opLoginRes = await request(app)
      .post('/api/auth/login')
      .send({ username: 'scoped.operator', password: 'TempPasswordScoped123!' });
    expect(opLoginRes.status).toBe(200);
    const opToken = opLoginRes.body.token;
    const opCookieHeader = opLoginRes.headers['set-cookie'][0];
    const opRefreshToken = opCookieHeader.split(';')[0].replace('refreshToken=', '');

    // 9. Confirm permitted facility access
    const permitRes = await request(app)
      .get('/test/facilities/facility-nashik-cold/scope-check')
      .set('Authorization', `Bearer ${opToken}`);
    expect(permitRes.status).toBe(200);

    // 10. Confirm unauthorized facility access returns 403
    const denyRes = await request(app)
      .get('/test/facilities/facility-pune-cold/scope-check')
      .set('Authorization', `Bearer ${opToken}`);
    expect(denyRes.status).toBe(403);
    expect(denyRes.body.error).toContain('not authorized to access facility');

    // 11. Refresh access token
    const refreshRes = await request(app)
      .post('/api/auth/refresh')
      .set('Cookie', [`refreshToken=${opRefreshToken}`]);
    expect(refreshRes.status).toBe(200);
    expect(refreshRes.body.token).toBeDefined();

    // 12. Confirm refresh token rotation
    const newOpCookieHeader = refreshRes.headers['set-cookie'][0];
    const rotatedRefreshToken = newOpCookieHeader.split(';')[0].replace('refreshToken=', '');
    expect(rotatedRefreshToken).not.toBe(opRefreshToken);

    // 13. Attempt reuse of previous refresh token and confirm rejection
    const reuseRes = await request(app)
      .post('/api/auth/refresh')
      .set('Cookie', [`refreshToken=${opRefreshToken}`]);
    expect(reuseRes.status).toBe(401);

    // 14. Logout
    const logoutRes = await request(app)
      .post('/api/auth/logout')
      .set('Cookie', [`refreshToken=${rotatedRefreshToken}`]);
    expect(logoutRes.status).toBe(200);

    // 15. Confirm session can no longer refresh
    const postLogoutRefresh = await request(app)
      .post('/api/auth/refresh')
      .set('Cookie', [`refreshToken=${rotatedRefreshToken}`]);
    expect(postLogoutRefresh.status).toBe(401);

    // 16. Confirm no plaintext credentials are logged/stored
    const persistedAdmin = await userRepository.findByUsername('bootstrap.superadmin');
    expect(persistedAdmin?.passwordHash).not.toContain('BootstrapSecretPassword999!');
    expect(persistedAdmin?.passwordHash).toContain('$argon2id$');
    const persistedOp = await userRepository.findByUsername('scoped.operator');
    expect(persistedOp?.passwordHash).not.toContain('TempPasswordScoped123!');
    expect(persistedOp?.passwordHash).toContain('$argon2id$');

    // Clean up test env variables
    delete process.env.BOOTSTRAP_ADMIN_USERNAME;
    delete process.env.BOOTSTRAP_ADMIN_PASSWORD;
  });
});
