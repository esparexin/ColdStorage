import mongoose from 'mongoose';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../app.js';
import { FacilityModel } from '../database/models/facility.model.js';
import { SessionModel } from '../database/models/session.model.js';
import { UserModel } from '../database/models/user.model.js';
import { CustomerModel } from '../database/models/customer.model.js';
import { authService } from '../modules/auth/auth.service.js';
import { hashPassword } from '../utils/crypto.js';

const app = createApp();

describe('P8 Import & Export Routes Integration Tests', () => {
  const facilityId = 'fac-ie-routes-1';
  const otherFacilityId = 'fac-ie-routes-2';

  let superAdminToken: string;
  let adminOtherToken: string;
  let operatorToken: string;
  let readOnlyToken: string;
  let mustChangePasswordToken: string;

  beforeAll(async () => {
    const mongoUri = process.env.MONGODB_URI ?? 'mongodb://127.0.0.1:27017/cold_storage_test';
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(mongoUri);
    }
  });

  afterAll(async () => {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
  });

  beforeEach(async () => {
    await FacilityModel.deleteMany({});
    await UserModel.deleteMany({});
    await SessionModel.deleteMany({});
    await CustomerModel.deleteMany({});

    await FacilityModel.create([
      { id: facilityId, name: 'Facility One', code: 'F1', isActive: true },
      { id: otherFacilityId, name: 'Facility Two', code: 'F2', isActive: true },
    ]);

    const passwordHash = await hashPassword('SecurePass123!');
    await UserModel.create([
      {
        id: 'usr-ie-sa',
        username: 'ie_superadmin',
        employeeId: 'EMP-ISA',
        mobile: '9876541001',
        email: 'ie_sa@example.com',
        passwordHash,
        fullName: 'IE Super Admin',
        role: 'SUPER_ADMIN',
        facilityIds: [],
        isActive: true,
        mustChangePassword: false,
      },
      {
        id: 'usr-ie-admin-other',
        username: 'ie_admin_other',
        employeeId: 'EMP-IAO',
        mobile: '9876541002',
        email: 'ie_ao@example.com',
        passwordHash,
        fullName: 'IE Admin Other',
        role: 'ADMIN',
        facilityIds: [otherFacilityId],
        isActive: true,
        mustChangePassword: false,
      },
      {
        id: 'usr-ie-op',
        username: 'ie_operator',
        employeeId: 'EMP-IOP',
        mobile: '9876541003',
        email: 'ie_op@example.com',
        passwordHash,
        fullName: 'IE Operator',
        role: 'OPERATOR',
        facilityIds: [facilityId],
        isActive: true,
        mustChangePassword: false,
      },
      {
        id: 'usr-ie-ro',
        username: 'ie_readonly',
        employeeId: 'EMP-IRO',
        mobile: '9876541004',
        email: 'ie_ro@example.com',
        passwordHash,
        fullName: 'IE ReadOnly',
        role: 'READ_ONLY',
        facilityIds: [facilityId],
        isActive: true,
        mustChangePassword: false,
      },
      {
        id: 'usr-ie-pwd',
        username: 'ie_must_change',
        employeeId: 'EMP-IPW',
        mobile: '9876541005',
        email: 'ie_pw@example.com',
        passwordHash,
        fullName: 'Must Change Password',
        role: 'ADMIN',
        facilityIds: [facilityId],
        isActive: true,
        mustChangePassword: true,
      },
    ]);

    const saLogin = await authService.login({
      username: 'ie_superadmin',
      password: 'SecurePass123!',
    });
    superAdminToken = saLogin.accessToken;

    const aoLogin = await authService.login({
      username: 'ie_admin_other',
      password: 'SecurePass123!',
    });
    adminOtherToken = aoLogin.accessToken;

    const opLogin = await authService.login({
      username: 'ie_operator',
      password: 'SecurePass123!',
    });
    operatorToken = opLogin.accessToken;

    const roLogin = await authService.login({
      username: 'ie_readonly',
      password: 'SecurePass123!',
    });
    readOnlyToken = roLogin.accessToken;

    const pwdLogin = await authService.login({
      username: 'ie_must_change',
      password: 'SecurePass123!',
    });
    mustChangePasswordToken = pwdLogin.accessToken;
  });

  // 1. Returns 401 when unauthenticated.
  it('returns 401 when unauthenticated', async () => {
    const res = await request(app).post(`/api/facilities/${facilityId}/import/customers`);
    expect(res.status).toBe(401);
  });

  // 2. Returns 403 when mustChangePassword = true.
  it('returns 403 when mustChangePassword = true', async () => {
    const res = await request(app)
      .post(`/api/facilities/${facilityId}/import/customers`)
      .set('Authorization', `Bearer ${mustChangePasswordToken}`)
      .attach('file', Buffer.from('name,mobile\nAlice,9876543210'), 'customers.csv');
    expect(res.status).toBe(403);
  });

  // 3. Returns 403 when user lacks import:execute (e.g. OPERATOR on import).
  it('returns 403 when user lacks import:execute (e.g. OPERATOR on import)', async () => {
    const res = await request(app)
      .post(`/api/facilities/${facilityId}/import/customers`)
      .set('Authorization', `Bearer ${operatorToken}`)
      .attach('file', Buffer.from('name,mobile\nAlice,9876543210'), 'customers.csv');
    expect(res.status).toBe(403);
  });

  // 4. Returns 403 when user lacks export:execute (e.g. READ_ONLY on export).
  it('returns 403 when user lacks export:execute (e.g. READ_ONLY on export)', async () => {
    const res = await request(app)
      .get(`/api/facilities/${facilityId}/export/customers`)
      .set('Authorization', `Bearer ${readOnlyToken}`);
    expect(res.status).toBe(403);
  });

  // 5. Returns 403 on cross-facility access attempt.
  it('returns 403 on cross-facility access attempt', async () => {
    const res = await request(app)
      .get(`/api/facilities/${facilityId}/export/customers`)
      .set('Authorization', `Bearer ${adminOtherToken}`);
    expect(res.status).toBe(403);
  });

  // 6. Returns 400 when multipart form field name is not file.
  it('returns 400 when multipart form field name is not file', async () => {
    const res = await request(app)
      .post(`/api/facilities/${facilityId}/import/customers`)
      .set('Authorization', `Bearer ${superAdminToken}`)
      .attach('wrong_field', Buffer.from('name,mobile\nAlice,9876543210'), 'customers.csv');
    expect(res.status).toBe(400);
  });

  // 7. Returns 400 when uploaded file extension is not .csv.
  it('returns 400 when uploaded file extension is not .csv', async () => {
    const res = await request(app)
      .post(`/api/facilities/${facilityId}/import/customers`)
      .set('Authorization', `Bearer ${superAdminToken}`)
      .attach('file', Buffer.from('name,mobile\nAlice,9876543210'), 'customers.xlsx');
    expect(res.status).toBe(400);
  });

  // 8. Returns 400 when MIME type is invalid (e.g. application/pdf).
  it('returns 400 when MIME type is invalid (e.g. application/pdf)', async () => {
    const res = await request(app)
      .post(`/api/facilities/${facilityId}/import/customers`)
      .set('Authorization', `Bearer ${superAdminToken}`)
      .attach('file', Buffer.from('sample data'), {
        filename: 'test.csv',
        contentType: 'application/pdf',
      });
    expect(res.status).toBe(400);
  });

  // 9. Returns 400 when file size exceeds 2 MB.
  it('returns 400 when file size exceeds 2 MB', async () => {
    const bigBuffer = Buffer.alloc(2 * 1024 * 1024 + 100, 65); // > 2MB
    const res = await request(app)
      .post(`/api/facilities/${facilityId}/import/customers`)
      .set('Authorization', `Bearer ${superAdminToken}`)
      .attach('file', bigBuffer, 'customers.csv');
    expect(res.status).toBe(400);
  });

  // 10. Returns 400 when date range is invalid (from >= to).
  it('returns 400 when date range is invalid (from >= to)', async () => {
    const res = await request(app)
      .get(`/api/facilities/${facilityId}/export/customers?from=2026-10-05&to=2026-10-01`)
      .set('Authorization', `Bearer ${superAdminToken}`);
    expect(res.status).toBe(400);
  });

  // 11. Returns 400 when date filter is supplied to Stock Summary endpoint.
  it('returns 400 when date filter is supplied to Stock Summary endpoint', async () => {
    const res = await request(app)
      .get(`/api/facilities/${facilityId}/export/stock-summary?from=2026-10-01`)
      .set('Authorization', `Bearer ${superAdminToken}`);
    expect(res.status).toBe(400);
  });

  // 12. Returns 200 with ImportSummary for valid Customer / GRN upload, and 200 chunked CSV for valid export.
  it('returns 200 with ImportSummary for valid Customer / GRN upload, and 200 chunked CSV for valid export', async () => {
    // A. Valid Customer Import
    const csvContent = 'name,mobile\nCustomer Valid,9870001234\n';
    const importRes = await request(app)
      .post(`/api/facilities/${facilityId}/import/customers`)
      .set('Authorization', `Bearer ${superAdminToken}`)
      .attach('file', Buffer.from(csvContent), 'customers.csv');

    expect(importRes.status).toBe(200);
    expect(importRes.body.totalRows).toBe(1);
    expect(importRes.body.committed).toBe(1);
    expect(importRes.body.rejected).toBe(0);
    expect(importRes.body.results).toHaveLength(1);
    expect(importRes.body.results[0].status).toBe('committed');

    // B. Valid Customer Export
    const exportRes = await request(app)
      .get(`/api/facilities/${facilityId}/export/customers`)
      .set('Authorization', `Bearer ${superAdminToken}`);

    expect(exportRes.status).toBe(200);
    expect(exportRes.headers['content-type']).toBe('text/csv; charset=utf-8');
    expect(exportRes.text).toContain('Customer Valid');
    expect(exportRes.text).toContain('9870001234');
  });
});
