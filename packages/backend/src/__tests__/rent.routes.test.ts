import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../app.js';
import { config } from '../config.js';
import { createAuthSeeder } from './helpers/auth-fixtures.js';
import {
  connectRentSuite,
  disconnectRentSuite,
  resetRentCollections,
  seedRentScenario,
  type RentScenario,
} from './helpers/rent-fixtures.js';

/**
 * Rent HTTP surface: collection, canonical lookup, official receipt printing and the RBAC /
 * facility-scope guards around them.
 */
describe('Suite 3: Rent HTTP API & RBAC Routes — rent.routes.test.ts', () => {
  const app = createApp();
  const seed = createAuthSeeder(config.jwtSecret);

  const FACILITY_ID = 'fac-rent-route-1';
  const OTHER_FACILITY_ID = 'fac-rent-route-2';
  const RENT_USERS = ['usr-op-rent', 'usr-ro-rent', 'usr-other-op'];

  let scenario: RentScenario;
  let operatorToken: string;
  let readOnlyToken: string;
  let otherFacilityOperatorToken: string;

  const collect = (facilityId: string, token?: string) => {
    const call = request(app).post(`/api/facilities/${facilityId}/rent/collect`).send({
      grnId: scenario.grnId,
      amountPaid: 1000,
      paymentMode: 'Cash',
      paymentDate: new Date().toISOString(),
    });
    return token ? call.set('Authorization', `Bearer ${token}`) : call;
  };

  beforeAll(connectRentSuite);
  afterAll(disconnectRentSuite);

  beforeEach(async () => {
    await resetRentCollections({
      facilityIds: [FACILITY_ID, OTHER_FACILITY_ID],
      userIds: RENT_USERS,
    });
    scenario = await seedRentScenario({
      facilityId: FACILITY_ID,
      otherFacilityId: OTHER_FACILITY_ID,
      grnNumber: 'GRN-26-27-0042',
    });

    ({ token: operatorToken } = await seed({
      userId: RENT_USERS[0],
      username: 'operator_rent',
      role: 'OPERATOR',
      facilityIds: [scenario.facilityId],
    }));
    ({ token: readOnlyToken } = await seed({
      userId: RENT_USERS[1],
      username: 'readonly_rent',
      role: 'READ_ONLY',
      facilityIds: [scenario.facilityId],
    }));
    ({ token: otherFacilityOperatorToken } = await seed({
      userId: RENT_USERS[2],
      username: 'other_operator_rent',
      role: 'OPERATOR',
      facilityIds: [scenario.otherFacilityId],
    }));
  });

  // 1. POST collect records payment and returns HTTP 201 with receipt
  it('POST /api/facilities/:facilityId/rent/collect records payment and returns HTTP 201 with receipt', async () => {
    const res = await request(app)
      .post(`/api/facilities/${scenario.facilityId}/rent/collect`)
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({
        grnId: scenario.grnId,
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
    expect(res.body.summary.chamber).toBe(scenario.chamber);
    expect(res.body.summary).not.toHaveProperty('customerMobile');
  });

  // 2. GET grn/:identifier returns rent summary using canonical lookup
  it('GET /api/facilities/:facilityId/rent/grn/:identifier returns rent summary using canonical lookup', async () => {
    // Record initial payment
    await request(app)
      .post(`/api/facilities/${scenario.facilityId}/rent/collect`)
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({
        grnId: scenario.grnId,
        amountPaid: 2000,
        paymentMode: 'UPI',
        paymentDate: new Date().toISOString(),
      });

    // Lookup using operator-facing grnNumber
    const res = await request(app)
      .get(`/api/facilities/${scenario.facilityId}/rent/grn/${scenario.grnNumber}`)
      .set('Authorization', `Bearer ${operatorToken}`);

    expect(res.status).toBe(200);
    expect(res.body.grnId).toBe(scenario.grnId);
    expect(res.body.grnNumber).toBe(scenario.grnNumber);
    expect(res.body.rentAmount).toBe(scenario.rentAmount);
    expect(res.body.rentMonths).toBe(scenario.rentMonths);
    expect(res.body.totalPaid).toBe(2000);
    expect(res.body.remainingBalance).toBe(3000);
    expect(res.body.paymentStatus).toBe('Not Settled');
    expect(res.body.payments).toHaveLength(1);
  });

  // 3. GET receipts/:receiptNumber/print renders formal print HTML without preview watermark
  it('GET /api/facilities/:facilityId/rent/receipts/:receiptNumber/print renders formal print HTML without preview watermark', async () => {
    const postRes = await request(app)
      .post(`/api/facilities/${scenario.facilityId}/rent/collect`)
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({
        grnId: scenario.grnId,
        amountPaid: scenario.rentAmount,
        paymentMode: 'Cash',
        paymentDate: new Date().toISOString(),
      });

    const receiptNumber = postRes.body.payment.receiptNumber as string;

    const printRes = await request(app)
      .get(`/api/facilities/${scenario.facilityId}/rent/receipts/${receiptNumber}/print`)
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
    const res = await collect(scenario.facilityId, readOnlyToken);

    expect(res.status).toBe(403);
  });

  // 5. Enforces Facility Scope: Operator in Facility A cannot record payment for Facility B GRN (HTTP 403)
  it('enforces Facility Scope: Operator in Facility A cannot record payment for Facility B (HTTP 403)', async () => {
    const res = await collect(scenario.facilityId, otherFacilityOperatorToken);

    expect(res.status).toBe(403);
  });

  // 6. Rejects malformed payload with HTTP 400 and validation error details
  it('rejects malformed payload with HTTP 400 and validation error details', async () => {
    const res = await request(app)
      .post(`/api/facilities/${scenario.facilityId}/rent/collect`)
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({ grnId: '', amountPaid: -50, paymentMode: 'Crypto' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Validation failed');
    expect(res.body.details).toBeDefined();
  });

  // 7. Rejects payment exceeding balance with HTTP 400 and clear error message
  it('rejects payment exceeding balance with HTTP 400 and clear error message', async () => {
    const res = await request(app)
      .post(`/api/facilities/${scenario.facilityId}/rent/collect`)
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({
        grnId: scenario.grnId,
        amountPaid: 9999, // rent obligation is 5000
        paymentMode: 'Cash',
        paymentDate: new Date().toISOString(),
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/exceeds remaining rent balance/);
  });

  // 8. Unauthenticated requests are rejected with HTTP 401
  it('unauthenticated requests are rejected with HTTP 401', async () => {
    const res = await collect(scenario.facilityId);

    expect(res.status).toBe(401);
  });
});
