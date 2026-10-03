import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../app.js';
import { config } from '../config.js';
import { createAuthSeeder } from './helpers/auth-fixtures.js';
import {
  configureOrganization,
  connectDocumentDatabase,
  disconnectDocumentDatabase,
  ensureOrganizationUnconfigured,
  resetDocumentCollections,
  seedDocumentScenario,
  type DocumentScenario,
} from './helpers/document-db-fixtures.js';

/**
 * P9 Document Routes Authentication, RBAC & Facility Scope Guards.
 *
 * Every case here must be refused before a document is composed, so the assertions are on the
 * HTTP status and the stable error code/message rather than on rendered content. Authorized
 * printing and the strict CSP header are covered by document.routes.printing.test.ts.
 */
describe('P9 Document Routes, Security & Facility Validation Tests', () => {
  const facilityA = 'fac-routes-a';
  const facilityB = 'fac-routes-b';

  let superAdminToken: string;
  let adminToken: string;
  let readOnlyToken: string;
  let operatorFacilityBToken: string;
  let mustChangePasswordToken: string;
  let scenario: DocumentScenario;

  const seed = createAuthSeeder(config.jwtSecret);
  const app = createApp();

  beforeAll(async () => {
    await connectDocumentDatabase();

    ({ token: superAdminToken } = await seed({
      userId: 'doc-usr-sa',
      username: 'doc_superadmin',
      role: 'SUPER_ADMIN',
      facilityIds: [],
    }));
    ({ token: adminToken } = await seed({
      userId: 'doc-usr-adm',
      username: 'doc_admin',
      role: 'ADMIN',
      facilityIds: [facilityA],
    }));
    ({ token: readOnlyToken } = await seed({
      userId: 'doc-usr-ro',
      username: 'doc_readonly',
      role: 'READ_ONLY',
      facilityIds: [facilityA],
    }));
    ({ token: operatorFacilityBToken } = await seed({
      userId: 'doc-usr-op-b',
      username: 'doc_operator_b',
      role: 'OPERATOR',
      facilityIds: [facilityB],
    }));
    ({ token: mustChangePasswordToken } = await seed({
      userId: 'doc-usr-pwd',
      username: 'doc_pwd_change',
      role: 'OPERATOR',
      facilityIds: [facilityA],
      mustChangePassword: true,
    }));
  });

  afterAll(async () => {
    await disconnectDocumentDatabase();
  });

  beforeEach(async () => {
    await resetDocumentCollections();
    scenario = await seedDocumentScenario({ facilityId: facilityA, otherFacilityId: facilityB });
  });

  /** Prints the seeded GRN; omitting the token is how the unauthenticated case is exercised. */
  const printGrn = (bearer?: string) => {
    const call = request(app).get(`/api/facilities/${facilityA}/documents/grn/${scenario.grnId}`);
    return bearer ? call.set('Authorization', `Bearer ${bearer}`) : call;
  };

  // ---------------------------------------------------------------------------
  // 1. Returns 401 when unauthenticated on document print endpoints
  // ---------------------------------------------------------------------------
  it('returns 401 when unauthenticated on document print endpoints', async () => {
    const res = await printGrn();
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/Missing or malformed Authorization header/i);
  });

  // ---------------------------------------------------------------------------
  // 2. Returns 401 when unauthenticated on GET /api/settings
  // ---------------------------------------------------------------------------
  it('returns 401 when unauthenticated on GET /api/settings', async () => {
    const res = await request(app).get('/api/settings');
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/Missing or malformed Authorization header/i);
  });

  // ---------------------------------------------------------------------------
  // 3. Returns 403 when mustChangePassword = true
  // ---------------------------------------------------------------------------
  it('returns 403 when mustChangePassword = true', async () => {
    const res = await printGrn(mustChangePasswordToken);
    expect(res.status).toBe(403);
    expect(res.body.mustChangePassword).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // 4. Returns 403 when user lacks document:print (e.g. READ_ONLY)
  // ---------------------------------------------------------------------------
  it('returns 403 when user lacks document:print (e.g. READ_ONLY)', async () => {
    const res = await printGrn(readOnlyToken);
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/lacks permission 'document:print'/i);
  });

  // ---------------------------------------------------------------------------
  // 5. Returns 403 when non-SUPER_ADMIN (e.g. ADMIN or OPERATOR) attempts PUT /api/settings
  // ---------------------------------------------------------------------------
  it('returns 403 when non-SUPER_ADMIN attempts PUT /api/settings', async () => {
    const res = await request(app)
      .put('/api/settings')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        orgName: 'Unauthorized Update Org',
        address: 'Unauthorized Address',
        contact: '9999999999',
      });
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/lacks permission 'settings:manage'/i);
  });

  // ---------------------------------------------------------------------------
  // 6. Returns 403 on caller cross-facility access attempt (requireFacilityScope)
  // ---------------------------------------------------------------------------
  it('returns 403 on caller cross-facility access attempt', async () => {
    // operatorFacilityBToken has facilityIds: [facilityB], attempting to access facilityA route
    const res = await printGrn(operatorFacilityBToken);
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/not authorized to access facility/i);
  });

  // ---------------------------------------------------------------------------
  // 7. Returns 404 on document-level facility mismatch (route facilityId != entity.facilityId)
  // ---------------------------------------------------------------------------
  it('returns 404 on document-level facility mismatch', async () => {
    await configureOrganization();
    // superAdmin has access to all facilities, but the GRN belongs to facilityA, not facilityB
    const res = await request(app)
      .get(`/api/facilities/${facilityB}/documents/grn/${scenario.grnId}`)
      .set('Authorization', `Bearer ${superAdminToken}`);
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('FACILITY_MISMATCH');
    expect(res.body.error).toMatch(/not found within the specified facility scope/i);
  });

  // ---------------------------------------------------------------------------
  // 8. Returns 400 when document generation is attempted with unconfigured organization settings
  // ---------------------------------------------------------------------------
  it('returns 400 when document generation is attempted with unconfigured organization settings', async () => {
    // System settings has blank orgName
    await ensureOrganizationUnconfigured();

    const res = await printGrn(superAdminToken);
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('ORGANIZATION_NOT_CONFIGURED');
    expect(res.body.error).toMatch(/Organization details must be configured by an administrator/i);
  });

  // ---------------------------------------------------------------------------
  // 9. Returns 400 when invalid format parameter is requested (e.g. ?format=pdf)
  // ---------------------------------------------------------------------------
  it('returns 400 when invalid format parameter is requested (e.g. ?format=pdf)', async () => {
    await configureOrganization();
    const res = await request(app)
      .get(`/api/facilities/${facilityA}/documents/grn/${scenario.grnId}?format=pdf`)
      .set('Authorization', `Bearer ${superAdminToken}`);
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Validation failed');
  });
});
