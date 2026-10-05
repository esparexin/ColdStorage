import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../app.js';
import { config } from '../config.js';
import { createAuthSeeder } from './helpers/auth-fixtures.js';
import {
  configureOrganization,
  connectDocumentDatabase,
  disconnectDocumentDatabase,
  resetDocumentCollections,
  seedDocumentScenario,
  type DocumentScenario,
} from './helpers/document-db-fixtures.js';

/**
 * P9 Document Routes Authorized Printing, Settings Access & CSP Headers.
 *
 * These are the requests that survive the guards in document.routes.test.ts, so they assert the
 * happy-path contract: settings access resolves for an authenticated caller and a SUPER_ADMIN,
 * and every printed document is served as `text/html` under a strict CSP with its own document
 * number rendered.
 */
const STRICT_CSP =
  "default-src 'none'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'";

describe('P9 Document Routes Authorized Printing & CSP Headers', () => {
  const facilityA = 'fac-print-a';
  const facilityB = 'fac-print-b';

  let superAdminToken: string;
  let operatorToken: string;
  let scenario: DocumentScenario;

  const seed = createAuthSeeder(config.jwtSecret);
  const app = createApp();

  beforeAll(async () => {
    await connectDocumentDatabase();

    ({ token: superAdminToken } = await seed({
      userId: 'print-usr-sa',
      username: 'print_superadmin',
      role: 'SUPER_ADMIN',
      facilityIds: [],
    }));
    ({ token: operatorToken } = await seed({
      userId: 'print-usr-op',
      username: 'print_operator',
      role: 'OPERATOR',
      facilityIds: [facilityA],
    }));
  });

  afterAll(async () => {
    await disconnectDocumentDatabase();
  });

  beforeEach(async () => {
    await resetDocumentCollections();
    scenario = await seedDocumentScenario({ facilityId: facilityA, otherFacilityId: facilityB });
  });

  const expectPrintedDocument = (res: { status: number; headers: Record<string, string> }) => {
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('text/html; charset=utf-8');
    expect(res.headers['content-security-policy']).toBe(STRICT_CSP);
  };

  // ---------------------------------------------------------------------------
  // 10. Returns 200 with SystemSettings for authenticated user on GET /api/settings
  // ---------------------------------------------------------------------------
  it('returns 200 with SystemSettings for authenticated user on GET /api/settings', async () => {
    await configureOrganization();
    const res = await request(app)
      .get('/api/settings')
      .set('Authorization', `Bearer ${operatorToken}`);
    expect(res.status).toBe(200);
    expect(res.body.isConfigured).toBe(true);
    expect(res.body.settings.orgName).toBe('Himalayan Agri Cold Logistics Ltd');
    expect(res.body.settings.backupPolicy.retentionDays).toBe(30);
  });

  // ---------------------------------------------------------------------------
  // 11. Returns 200 and updates settings when called by SUPER_ADMIN on PUT /api/settings
  // ---------------------------------------------------------------------------
  it('returns 200 and updates settings when called by SUPER_ADMIN on PUT /api/settings', async () => {
    const res = await request(app)
      .put('/api/settings')
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({
        orgName: 'Updated Himalayan Cold Logistics Private Limited',
        address: 'National Highway 5, Solan, Himachal Pradesh 173212',
        contact: '+91 1792 230000 | admin@himalayanlogistics.com',
        gstin: '02BBBBB1111B2Z6',
        logoAssetId: 'logo_updated.png',
        printFooter: 'Authorized Commercial Print Copy',
        timezone: 'Asia/Kolkata',
        backupPolicy: {
          retentionDays: 14,
          backupEnabled: true,
        },
      });
    expect(res.status).toBe(200);
    expect(res.body.isConfigured).toBe(true);
    expect(res.body.settings.orgName).toBe('Updated Himalayan Cold Logistics Private Limited');
    expect(res.body.settings.backupPolicy.retentionDays).toBe(14);
  });

  // ---------------------------------------------------------------------------
  // 12. Returns 200 with text/html; charset=utf-8 and strict CSP header for valid requests
  // ---------------------------------------------------------------------------
  it('returns 200 with text/html; charset=utf-8 and strict CSP header for valid requests', async () => {
    await configureOrganization();

    // 12a. GRN document
    const grnRes = await request(app)
      .get(`/api/facilities/${facilityA}/documents/grn/${scenario.grnId}`)
      .set('Authorization', `Bearer ${operatorToken}`);
    expectPrintedDocument(grnRes);
    expect(grnRes.text).toContain('GOODS RECEIPT NOTE');
    expect(grnRes.text).toContain('GRN-2026-0001');

    // 12b. Inward Receipt document
    const rcptRes = await request(app)
      .get(`/api/facilities/${facilityA}/documents/receipt/${scenario.grnId}`)
      .set('Authorization', `Bearer ${operatorToken}`);
    expectPrintedDocument(rcptRes);
    expect(rcptRes.text).toContain('ACKNOWLEDGEMENT RECEIPT');
    expect(rcptRes.text).toContain('RCPT-2026-0001');

    // 12c. Delivery Challan document
    const chlRes = await request(app)
      .get(`/api/facilities/${facilityA}/documents/challan/${scenario.challanId}`)
      .set('Authorization', `Bearer ${operatorToken}`);
    expectPrintedDocument(chlRes);
    expect(chlRes.text).toContain('OUTWARD DELIVERY CHALLAN (GATE PASS)');
    expect(chlRes.text).toContain('CHL-2026-0001');

    // 12d. Rent Receipt Preview document. Only customerName, amount and paymentMode are accepted
    // query params; there is no customer mobile or chamber number to pass any more.
    const prevRes = await request(app)
      .get(
        `/api/facilities/${facilityA}/documents/rent-receipt/preview?customerName=Ramesh+Kumar&amount=15000&paymentMode=Cash`,
      )
      .set('Authorization', `Bearer ${operatorToken}`);
    expectPrintedDocument(prevRes);
    expect(prevRes.text).toContain('RENT PAYMENT RECEIPT [PREVIEW]');
    expect(prevRes.text).toContain('Ramesh Kumar');
    expect(prevRes.text).toContain('15000.00');
  });
});
