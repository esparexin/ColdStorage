import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../app.js';
import { config } from '../config.js';
import { createAuthSeeder } from './helpers/auth-fixtures.js';
import {
  IMPORT_FACILITY_ID,
  IMPORT_OTHER_FACILITY_ID,
  connectImportDatabase,
  disconnectImportDatabase,
  resetImportDatabase,
  seedImportMasterData,
} from './helpers/import-fixtures.js';

/**
 * P8 Import & Export Routes Integration Tests.
 *
 * `name` is now the only customer column, so every upload fixture uses a bare `name` header and
 * the export contract is exactly `name,isActive,createdAt`. The upload guards (.csv only, 2 MB
 * cap, MIME allowlist) and the export date-range rules are asserted at the HTTP boundary.
 */
describe('P8 Import & Export Routes Integration Tests', () => {
  const facilityId = IMPORT_FACILITY_ID;
  const otherFacilityId = IMPORT_OTHER_FACILITY_ID;

  let superAdminToken: string;
  let adminOtherToken: string;
  let operatorToken: string;
  let readOnlyToken: string;
  let mustChangePasswordToken: string;

  const seed = createAuthSeeder(config.jwtSecret);
  const app = createApp();

  beforeAll(async () => {
    await connectImportDatabase();

    ({ token: superAdminToken } = await seed({
      userId: 'usr-ie-sa',
      username: 'ie_superadmin',
      role: 'SUPER_ADMIN',
      facilityIds: [],
    }));
    ({ token: adminOtherToken } = await seed({
      userId: 'usr-ie-admin-other',
      username: 'ie_admin_other',
      role: 'ADMIN',
      facilityIds: [otherFacilityId],
    }));
    ({ token: operatorToken } = await seed({
      userId: 'usr-ie-op',
      username: 'ie_operator',
      role: 'OPERATOR',
      facilityIds: [facilityId],
    }));
    ({ token: readOnlyToken } = await seed({
      userId: 'usr-ie-ro',
      username: 'ie_readonly',
      role: 'READ_ONLY',
      facilityIds: [facilityId],
    }));
    ({ token: mustChangePasswordToken } = await seed({
      userId: 'usr-ie-pwd',
      username: 'ie_must_change',
      role: 'ADMIN',
      facilityIds: [facilityId],
      mustChangePassword: true,
    }));
  });

  afterAll(async () => {
    await disconnectImportDatabase();
  });

  beforeEach(async () => {
    await resetImportDatabase();
    await seedImportMasterData();
  });

  const uploadCustomers = (bearer?: string, body = 'name\nAlice') =>
    request(app)
      .post(`/api/facilities/${facilityId}/import/customers`)
      .set('Authorization', `Bearer ${bearer}`)
      .attach('file', Buffer.from(body), 'customers.csv');

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
      .attach('file', Buffer.from('name\nAlice'), 'customers.csv');
    expect(res.status).toBe(403);
  });

  // 3. Returns 403 when user lacks import:execute (e.g. OPERATOR on import).
  it('returns 403 when user lacks import:execute (e.g. OPERATOR on import)', async () => {
    const res = await uploadCustomers(operatorToken);
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
      .attach('wrong_field', Buffer.from('name\nAlice'), 'customers.csv');
    expect(res.status).toBe(400);
  });

  // 7. Returns 400 when uploaded file extension is not .csv.
  it('returns 400 when uploaded file extension is not .csv', async () => {
    const res = await request(app)
      .post(`/api/facilities/${facilityId}/import/customers`)
      .set('Authorization', `Bearer ${superAdminToken}`)
      .attach('file', Buffer.from('name\nAlice'), 'customers.xlsx');
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

  // 12. Returns 200 with ImportSummary for a valid Customer upload, and 200 chunked CSV for a valid export.
  it('returns 200 with ImportSummary for a valid Customer upload, and 200 chunked CSV for a valid export', async () => {
    // A. Valid Customer Import — `name` is the only column a customer CSV may carry.
    const importRes = await uploadCustomers(superAdminToken, 'name\nCustomer Valid\n');

    expect(importRes.status).toBe(200);
    expect(importRes.body.totalRows).toBe(1);
    expect(importRes.body.committed).toBe(1);
    expect(importRes.body.rejected).toBe(0);
    expect(importRes.body.results).toHaveLength(1);
    expect(importRes.body.results[0].status).toBe('committed');

    // B. Valid Customer Export — header is exactly name,isActive,createdAt.
    const exportRes = await request(app)
      .get(`/api/facilities/${facilityId}/export/customers`)
      .set('Authorization', `Bearer ${superAdminToken}`);

    expect(exportRes.status).toBe(200);
    expect(exportRes.headers['content-type']).toBe('text/csv; charset=utf-8');
    expect(exportRes.text.split('\r\n')[0]).toBe('name,isActive,createdAt');
    expect(exportRes.text).toContain('Customer Valid');
  });
});
