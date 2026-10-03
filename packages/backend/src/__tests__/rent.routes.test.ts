import mongoose from 'mongoose';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../app.js';
import { CounterModel } from '../database/models/counter.model.js';
import { FacilityModel } from '../database/models/facility.model.js';
import { GrnModel } from '../database/models/grn.model.js';
import { RentPaymentModel } from '../database/models/rent-payment.model.js';
import { SystemSettingsModel } from '../database/models/system-settings.model.js';
import { UserModel } from '../database/models/user.model.js';
import { authService } from '../modules/auth/auth.service.js';
import { hashPassword } from '../utils/crypto.js';

const app = createApp();

describe('Suite 3: Rent HTTP API & RBAC Routes — rent.routes.test.ts', () => {
  let operatorToken: string;
  let readOnlyToken: string;
  let otherFacilityOperatorToken: string;

  const facilityId = 'fac-rent-route-1';
  const otherFacilityId = 'fac-rent-route-2';
  const grnId = 'grn-rent-route-1';
  const grnNumber = 'GRN-26-27-0042';

  beforeAll(async () => {
    const mongoUri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/cold_storage_test';
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
    await GrnModel.deleteMany({});
    await CounterModel.deleteMany({});
    await UserModel.deleteMany({});
    await SystemSettingsModel.deleteMany({});
    await RentPaymentModel.collection.deleteMany({});
    await mongoose.connection.collection('auditlogs').deleteMany({});

    // 1. Facilities
    await FacilityModel.create([
      { id: facilityId, name: 'Main Rent Facility', code: 'MRF', isActive: true },
      { id: otherFacilityId, name: 'Other Rent Facility', code: 'ORF', isActive: true },
    ]);

    // 2. System Settings
    await SystemSettingsModel.create({
      _id: 'SYSTEM_SETTINGS',
      orgName: 'Sheetal Cold Storage Ltd',
      address: 'Plot 42, Cold Chain Zone, Nashik, MH',
      contact: '+91 98765 43210',
      gstin: '27AAAAA0000A1Z5',
      timezone: 'Asia/Kolkata',
      printFooter: 'Official Computer Generated Receipt.',
    });

    // 3. Canonical GRN with Rent Obligation
    await GrnModel.create({
      id: grnId,
      facilityId,
      grnNumber,
      inwardReceiptNumber: 'RCPT-26-27-0042',
      date: new Date(),
      customerId: 'cust-rent-1',
      customerName: 'Shri Ram Agro Traders',
      commodityId: 'cmd-rent-1',
      commodityName: 'Potatoes',
      chamberId: 'ch-1',
      chamberNumber: 'CH-01',
      bags: 100,
      bagType: 'B',
      rentType: 'Seasonal',
      rentMonths: null,
      rentAmount: 5000,
      status: 'OPEN',
      createdBy: 'admin',
    });

    // 4. Users with Roles
    const passwordHash = await hashPassword('SecurePass123!');
    await UserModel.create([
      {
        id: 'usr-op-rent',
        username: 'operator_rent',
        employeeId: 'EMP-RENT-1',
        mobile: '9876543201',
        email: 'op_rent@example.com',
        passwordHash,
        fullName: 'Rent Operator',
        role: 'OPERATOR',
        facilityIds: [facilityId],
        isActive: true,
        mustChangePassword: false,
      },
      {
        id: 'usr-ro-rent',
        username: 'readonly_rent',
        employeeId: 'EMP-RENT-2',
        mobile: '9876543202',
        email: 'ro_rent@example.com',
        passwordHash,
        fullName: 'Rent ReadOnly',
        role: 'READ_ONLY',
        facilityIds: [facilityId],
        isActive: true,
        mustChangePassword: false,
      },
      {
        id: 'usr-other-op',
        username: 'other_operator_rent',
        employeeId: 'EMP-RENT-3',
        mobile: '9876543203',
        email: 'other_rent@example.com',
        passwordHash,
        fullName: 'Other Facility Operator',
        role: 'OPERATOR',
        facilityIds: [otherFacilityId],
        isActive: true,
        mustChangePassword: false,
      },
    ]);

    // 5. Auth Tokens
    const opLogin = await authService.login({
      username: 'operator_rent',
      password: 'SecurePass123!',
    });
    operatorToken = opLogin.accessToken;

    const roLogin = await authService.login({
      username: 'readonly_rent',
      password: 'SecurePass123!',
    });
    readOnlyToken = roLogin.accessToken;

    const otherLogin = await authService.login({
      username: 'other_operator_rent',
      password: 'SecurePass123!',
    });
    otherFacilityOperatorToken = otherLogin.accessToken;
  });

  // 1. POST collect records payment and returns HTTP 201 with receipt
  it('POST /api/facilities/:facilityId/rent/collect records payment and returns HTTP 201 with receipt', async () => {
    const res = await request(app)
      .post(`/api/facilities/${facilityId}/rent/collect`)
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({
        grnId,
        amountPaid: 3000,
        paymentMode: 'Cash',
        paymentDate: new Date().toISOString(),
        notes: 'Counter Cash Payment',
      });

    expect(res.status).toBe(201);
    expect(res.body.payment).toBeDefined();
    expect(res.body.payment.amountPaid).toBe(3000);
    expect(res.body.payment.paymentMode).toBe('Cash');
    expect(res.body.payment.receiptNumber).toMatch(/^RRCPT-\d{2}-\d{2}-0001$/);
    expect(res.body.summary.remainingBalance).toBe(2000);
    expect(res.body.summary.paymentStatus).toBe('Not Settled');
  });

  // 2. GET grn/:identifier returns rent summary using canonical lookup
  it('GET /api/facilities/:facilityId/rent/grn/:identifier returns rent summary using canonical lookup', async () => {
    // Record initial payment
    await request(app)
      .post(`/api/facilities/${facilityId}/rent/collect`)
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({
        grnId,
        amountPaid: 2000,
        paymentMode: 'UPI',
        paymentDate: new Date().toISOString(),
      });

    // Lookup using operator-facing grnNumber
    const res = await request(app)
      .get(`/api/facilities/${facilityId}/rent/grn/${grnNumber}`)
      .set('Authorization', `Bearer ${operatorToken}`);

    expect(res.status).toBe(200);
    expect(res.body.grnId).toBe(grnId);
    expect(res.body.grnNumber).toBe(grnNumber);
    expect(res.body.rentAmount).toBe(5000);
    expect(res.body.totalPaid).toBe(2000);
    expect(res.body.remainingBalance).toBe(3000);
    expect(res.body.paymentStatus).toBe('Not Settled');
    expect(res.body.payments).toHaveLength(1);
  });

  // 3. GET receipts/:receiptNumber/print renders formal print HTML without preview watermark
  it('GET /api/facilities/:facilityId/rent/receipts/:receiptNumber/print renders formal print HTML without preview watermark', async () => {
    const postRes = await request(app)
      .post(`/api/facilities/${facilityId}/rent/collect`)
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({
        grnId,
        amountPaid: 5000,
        paymentMode: 'Cash',
        paymentDate: new Date().toISOString(),
      });

    const receiptNumber = postRes.body.payment.receiptNumber;

    const printRes = await request(app)
      .get(`/api/facilities/${facilityId}/rent/receipts/${receiptNumber}/print`)
      .set('Authorization', `Bearer ${operatorToken}`);

    expect(printRes.status).toBe(200);
    expect(printRes.headers['content-type']).toContain('text/html');
    expect(printRes.text).toContain('RENT PAYMENT RECEIPT');
    expect(printRes.text).toContain('Sheetal Cold Storage Ltd');
    expect(printRes.text).toContain(receiptNumber);
    expect(printRes.text).not.toContain('PREVIEW ONLY');
    expect(printRes.text).not.toContain('WATERMARK');
  });

  // 4. Enforces RBAC: READ_ONLY user cannot record payment (HTTP 403)
  it('enforces RBAC: READ_ONLY user cannot record payment (HTTP 403)', async () => {
    const res = await request(app)
      .post(`/api/facilities/${facilityId}/rent/collect`)
      .set('Authorization', `Bearer ${readOnlyToken}`)
      .send({
        grnId,
        amountPaid: 1000,
        paymentMode: 'Cash',
        paymentDate: new Date().toISOString(),
      });

    expect(res.status).toBe(403);
  });

  // 5. Enforces Facility Scope: Operator in Facility A cannot record payment for Facility B GRN (HTTP 403)
  it('enforces Facility Scope: Operator in Facility A cannot record payment for Facility B (HTTP 403)', async () => {
    const res = await request(app)
      .post(`/api/facilities/${facilityId}/rent/collect`)
      .set('Authorization', `Bearer ${otherFacilityOperatorToken}`)
      .send({
        grnId,
        amountPaid: 1000,
        paymentMode: 'Cash',
        paymentDate: new Date().toISOString(),
      });

    expect(res.status).toBe(403);
  });

  // 6. Rejects malformed payload with HTTP 400 and validation error details
  it('rejects malformed payload with HTTP 400 and validation error details', async () => {
    const res = await request(app)
      .post(`/api/facilities/${facilityId}/rent/collect`)
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({
        grnId: '',
        amountPaid: -50,
        paymentMode: 'Crypto',
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Validation failed');
    expect(res.body.details).toBeDefined();
  });

  // 7. Rejects payment exceeding balance with HTTP 400 and clear error message
  it('rejects payment exceeding balance with HTTP 400 and clear error message', async () => {
    const res = await request(app)
      .post(`/api/facilities/${facilityId}/rent/collect`)
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({
        grnId,
        amountPaid: 9999, // rent obligation is 5000
        paymentMode: 'Cash',
        paymentDate: new Date().toISOString(),
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/exceeds remaining rent balance/);
  });

  // 8. Unauthenticated requests are rejected with HTTP 401
  it('unauthenticated requests are rejected with HTTP 401', async () => {
    const res = await request(app).post(`/api/facilities/${facilityId}/rent/collect`).send({
      grnId,
      amountPaid: 1000,
      paymentMode: 'Cash',
      paymentDate: new Date().toISOString(),
    });

    expect(res.status).toBe(401);
  });
});
