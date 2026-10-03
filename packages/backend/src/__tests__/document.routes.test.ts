import mongoose from 'mongoose';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../app.js';
import { config } from '../config.js';
import { CustomerModel } from '../database/models/customer.model.js';
import { DeliveryChallanModel } from '../database/models/delivery-challan.model.js';
import { FacilityModel } from '../database/models/facility.model.js';
import { GrnModel } from '../database/models/grn.model.js';
import { SystemSettingsModel } from '../database/models/system-settings.model.js';
import { UserModel } from '../database/models/user.model.js';
import { createAuthSeeder } from './helpers/auth-fixtures.js';

const app = createApp();

describe('P9 Document Routes, Security & Facility Validation Tests', () => {
  const facilityA = 'fac-routes-a';
  const facilityB = 'fac-routes-b';

  let superAdminToken: string;
  let adminToken: string;
  let operatorToken: string;
  let readOnlyToken: string;
  let operatorFacilityBToken: string;
  let mustChangePasswordToken: string;

  const seed = createAuthSeeder(config.jwtSecret);

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
    await SystemSettingsModel.deleteMany({});
    await FacilityModel.deleteMany({});
    await CustomerModel.deleteMany({});
    await GrnModel.deleteMany({});
    await DeliveryChallanModel.deleteMany({});
    await UserModel.deleteMany({});

    // Create facilities
    await FacilityModel.create([
      {
        id: facilityA,
        name: 'Himachal Cold Facility A',
        code: 'HCF-A',
        address: 'Sector 5, Parwanoo, HP',
        isActive: true,
      },
      {
        id: facilityB,
        name: 'Himachal Cold Facility B',
        code: 'HCF-B',
        address: 'Industrial Area, Solan, HP',
        isActive: true,
      },
    ]);

    // Create test customer
    await CustomerModel.create({
      id: 'cust-r-1',
      facilityId: facilityA,
      name: 'Balwinder Singh',
      mobile: '9876500001',
      status: 'ACTIVE',
      createdBy: 'sys',
    });

    // Create test GRN in facilityA
    await GrnModel.create({
      id: 'grn-r-1',
      facilityId: facilityA,
      grnNumber: 'GRN-2026-0001',
      inwardReceiptNumber: 'RCPT-2026-0001',
      date: new Date('2026-10-01'),
      customerId: 'cust-r-1',
      customerName: 'Balwinder Singh',
      commodityId: 'comm-1',
      commodityName: 'Apple (Royal Delicious)',
      chamberId: 'ch-1',
      chamberNumber: 'CH-01',
      bags: 100,
      bagType: 'B',
      rentType: 'Monthly',
      rentAmount: 20000,
      status: 'OPEN',
      createdBy: 'usr-1',
    });

    // Create test Delivery Challan in facilityA
    await DeliveryChallanModel.create({
      id: 'chl-r-1',
      facilityId: facilityA,
      challanNumber: 'CHL-2026-0001',
      date: new Date('2026-10-01'),
      grnId: 'grn-r-1',
      grnNumber: 'GRN-2026-0001',
      customerId: 'cust-r-1',
      customerName: 'Balwinder Singh',
      commodityId: 'comm-1',
      commodityName: 'Apple (Royal Delicious)',
      chamberId: 'ch-1',
      chamberNumber: 'CH-01',
      items: [
        {
          positionId: 'pos-1',
          positionCode: 'POS-01',
          bags: 20,
        },
      ],
      totalBags: 20,
      vehicleNumber: 'PB-01-AA-1122',
      driverName: 'Gurdeep Singh',
      issuedBy: 'Operator',
      status: 'ISSUED',
    });

    // Generate tokens
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

    ({ token: operatorToken } = await seed({
      userId: 'doc-usr-op',
      username: 'doc_operator',
      role: 'OPERATOR',
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

  const configureOrganization = async () => {
    await SystemSettingsModel.findOneAndUpdate(
      { _id: 'SYSTEM_SETTINGS' },
      {
        $set: {
          orgName: 'Himalayan Agri Cold Logistics Ltd',
          address: 'Fruit Mandi Complex, Shimla, Himachal Pradesh 171001',
          contact: '+91 177 2830000 | ops@himalayanagri.com',
          gstin: '02AAAAA0000A1Z5',
          logoAssetId: 'logo_himalayan_01.png',
          printFooter:
            'This is a computer-generated official document. No manual signature needed.',
          timezone: 'Asia/Kolkata',
          updatedBy: 'usr-sa',
        },
      },
      { upsert: true },
    );
  };

  // ---------------------------------------------------------------------------
  // 1. Returns 401 when unauthenticated on document print endpoints
  // ---------------------------------------------------------------------------
  it('returns 401 when unauthenticated on document print endpoints', async () => {
    const res = await request(app).get(`/api/facilities/${facilityA}/documents/grn/grn-r-1`);
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
    const res = await request(app)
      .get(`/api/facilities/${facilityA}/documents/grn/grn-r-1`)
      .set('Authorization', `Bearer ${mustChangePasswordToken}`);
    expect(res.status).toBe(403);
    expect(res.body.mustChangePassword).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // 4. Returns 403 when user lacks document:print (e.g. READ_ONLY)
  // ---------------------------------------------------------------------------
  it('returns 403 when user lacks document:print (e.g. READ_ONLY)', async () => {
    const res = await request(app)
      .get(`/api/facilities/${facilityA}/documents/grn/grn-r-1`)
      .set('Authorization', `Bearer ${readOnlyToken}`);
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
    const res = await request(app)
      .get(`/api/facilities/${facilityA}/documents/grn/grn-r-1`)
      .set('Authorization', `Bearer ${operatorFacilityBToken}`);
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/not authorized to access facility/i);
  });

  // ---------------------------------------------------------------------------
  // 7. Returns 404 on document-level facility mismatch (route facilityId != entity.facilityId)
  // ---------------------------------------------------------------------------
  it('returns 404 on document-level facility mismatch', async () => {
    await configureOrganization();
    // superAdmin has access to all facilities, but document grn-r-1 belongs to facilityA, not facilityB
    const res = await request(app)
      .get(`/api/facilities/${facilityB}/documents/grn/grn-r-1`)
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
    await SystemSettingsModel.findOneAndUpdate(
      { _id: 'SYSTEM_SETTINGS' },
      {
        $setOnInsert: {
          orgName: '',
          address: '',
          contact: '',
        },
      },
      { upsert: true },
    );

    const res = await request(app)
      .get(`/api/facilities/${facilityA}/documents/grn/grn-r-1`)
      .set('Authorization', `Bearer ${superAdminToken}`);
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
      .get(`/api/facilities/${facilityA}/documents/grn/grn-r-1?format=pdf`)
      .set('Authorization', `Bearer ${superAdminToken}`);
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Validation failed');
  });

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
    expect(res.body.settings.backupPolicy.atlasRetentionDays).toBe(7);
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
          atlasRetentionDays: 14,
          driveRetentionDays: 60,
          driveBackupEnabled: true,
        },
      });
    expect(res.status).toBe(200);
    expect(res.body.isConfigured).toBe(true);
    expect(res.body.settings.orgName).toBe('Updated Himalayan Cold Logistics Private Limited');
    expect(res.body.settings.backupPolicy.atlasRetentionDays).toBe(14);
  });

  // ---------------------------------------------------------------------------
  // 12. Returns 200 with text/html; charset=utf-8 and strict CSP header for valid requests
  // ---------------------------------------------------------------------------
  it('returns 200 with text/html; charset=utf-8 and strict CSP header for valid requests', async () => {
    await configureOrganization();

    // 12a. GRN document
    const grnRes = await request(app)
      .get(`/api/facilities/${facilityA}/documents/grn/grn-r-1`)
      .set('Authorization', `Bearer ${operatorToken}`);
    expect(grnRes.status).toBe(200);
    expect(grnRes.headers['content-type']).toBe('text/html; charset=utf-8');
    expect(grnRes.headers['content-security-policy']).toBe(
      "default-src 'none'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'",
    );
    expect(grnRes.text).toContain('GOODS RECEIPT NOTE');
    expect(grnRes.text).toContain('GRN-2026-0001');

    // 12b. Inward Receipt document
    const rcptRes = await request(app)
      .get(`/api/facilities/${facilityA}/documents/receipt/grn-r-1`)
      .set('Authorization', `Bearer ${operatorToken}`);
    expect(rcptRes.status).toBe(200);
    expect(rcptRes.headers['content-type']).toBe('text/html; charset=utf-8');
    expect(rcptRes.headers['content-security-policy']).toBe(
      "default-src 'none'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'",
    );
    expect(rcptRes.text).toContain('FARMER INWARD ACKNOWLEDGEMENT RECEIPT');
    expect(rcptRes.text).toContain('RCPT-2026-0001');

    // 12c. Delivery Challan document
    const chlRes = await request(app)
      .get(`/api/facilities/${facilityA}/documents/challan/chl-r-1`)
      .set('Authorization', `Bearer ${operatorToken}`);
    expect(chlRes.status).toBe(200);
    expect(chlRes.headers['content-type']).toBe('text/html; charset=utf-8');
    expect(chlRes.headers['content-security-policy']).toBe(
      "default-src 'none'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'",
    );
    expect(chlRes.text).toContain('OUTWARD DELIVERY CHALLAN (GATE PASS)');
    expect(chlRes.text).toContain('CHL-2026-0001');

    // 12d. Rent Receipt Preview document
    const prevRes = await request(app)
      .get(
        `/api/facilities/${facilityA}/documents/rent-receipt/preview?customerName=Ramesh+Kumar&amount=15000&periodMonths=3`,
      )
      .set('Authorization', `Bearer ${operatorToken}`);
    expect(prevRes.status).toBe(200);
    expect(prevRes.headers['content-type']).toBe('text/html; charset=utf-8');
    expect(prevRes.headers['content-security-policy']).toBe(
      "default-src 'none'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'",
    );
    expect(prevRes.text).toContain('RENT PAYMENT RECEIPT [PREVIEW]');
    expect(prevRes.text).toContain('Ramesh Kumar');
    expect(prevRes.text).toContain('15000.00');
  });
});
