import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../app.js';
import { userRepository } from '../modules/users/user.repository.js';

describe('P2 Auth + Users + RBAC Integration', () => {
  const app = createApp();

  beforeEach(() => {
    userRepository.resetForTesting();
  });

  it('responds with health check status', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.phase).toBe('P2');
  });

  it('performs Super Admin initial login with temporary password and forces password change', async () => {
    // 1. Initial login
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ username: 'superadmin', password: 'SuperAdmin123!' });

    expect(loginRes.status).toBe(200);
    expect(loginRes.body.token).toBeDefined();
    expect(loginRes.body.mustChangePassword).toBe(true);

    const token = loginRes.body.token;

    // 2. Change password
    const changeRes = await request(app)
      .post('/api/auth/change-password')
      .set('Authorization', `Bearer ${token}`)
      .send({
        currentPassword: 'SuperAdmin123!',
        newPassword: 'SuperSecurePassword2026!',
      });

    expect(changeRes.status).toBe(200);
    expect(changeRes.body.success).toBe(true);
    expect(changeRes.body.user.mustChangePassword).toBe(false);

    // 3. Old password must fail
    const failRes = await request(app)
      .post('/api/auth/login')
      .send({ username: 'superadmin', password: 'SuperAdmin123!' });
    expect(failRes.status).toBe(401);

    // 4. New password succeeds and mustChangePassword is false
    const newLoginRes = await request(app)
      .post('/api/auth/login')
      .send({ username: 'superadmin', password: 'SuperSecurePassword2026!' });
    expect(newLoginRes.status).toBe(200);
    expect(newLoginRes.body.mustChangePassword).toBe(false);
  });

  it('allows Super Admin to provision an Operator with temporary password, and enforces RBAC', async () => {
    // Super Admin login
    const adminLogin = await request(app)
      .post('/api/auth/login')
      .send({ username: 'superadmin', password: 'SuperAdmin123!' });
    const adminToken = adminLogin.body.token;

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

    // Operator logs in
    const opLogin = await request(app)
      .post('/api/auth/login')
      .send({ username: 'kishore.k', password: 'TempPassword456!' });
    expect(opLogin.status).toBe(200);
    const opToken = opLogin.body.token;

    // Operator attempts to access user:manage route (should be 403 Forbidden)
    const unauthorizedRes = await request(app)
      .get('/api/users')
      .set('Authorization', `Bearer ${opToken}`);

    expect(unauthorizedRes.status).toBe(403);
    expect(unauthorizedRes.body.error).toContain("Role 'OPERATOR' lacks permission 'user:manage'");
  });

  it('enforces facility-scoped authorization for assigned vs unassigned facilities', async () => {
    // Super Admin login
    const adminLogin = await request(app)
      .post('/api/auth/login')
      .send({ username: 'superadmin', password: 'SuperAdmin123!' });
    const adminToken = adminLogin.body.token;

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
      .get('/api/facilities/facility-north/ping')
      .set('Authorization', `Bearer ${opToken}`);
    expect(permitRes.status).toBe(200);
    expect(permitRes.body.message).toContain('Access granted');

    // Operator attempts to access unassigned facility -> 403 Forbidden
    const denyRes = await request(app)
      .get('/api/facilities/facility-south/ping')
      .set('Authorization', `Bearer ${opToken}`);
    expect(denyRes.status).toBe(403);
    expect(denyRes.body.error).toContain('not authorized to access facility');

    // Super Admin accesses facility-south -> 200 OK (Super Admin has global facility scope)
    const adminPermitRes = await request(app)
      .get('/api/facilities/facility-south/ping')
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
});
