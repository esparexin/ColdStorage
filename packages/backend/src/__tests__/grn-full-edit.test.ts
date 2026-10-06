import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../app.js';
import { config } from '../config.js';
import { CommodityModel } from '../database/models/commodity.model.js';
import { CustomerModel } from '../database/models/customer.model.js';
import { rentService } from '../modules/rent/rent.service.js';
import { createAuthSeeder } from './helpers/auth-fixtures.js';
import { seedCustomer, seedFacility, seedGrn } from './helpers/master-data-fixtures.js';
import {
  connectToTestDatabase,
  disconnectTestDatabase,
  resetStockCollections,
} from './helpers/stock-reset.js';

const app = createApp();
const seedAuth = createAuthSeeder(config.jwtSecret);

const facilityId = 'fac-north-full-edit';

/**
 * True full-edit coverage for the inward receipt (PATCH /grn/:id with grn:correct).
 * Base correction guards (CLOSED, active delivery, audit trail) stay pinned in
 * grn-correction.test.ts; this file owns identity, pricing and rent-guard cases.
 */
describe('GRN Full Edit (PATCH /api/facilities/:facilityId/grns/:grnId)', () => {
  let adminToken: string;
  let customerId: string;
  let commodityId: string;
  let grnId: string;

  beforeAll(async () => {
    await connectToTestDatabase();

    ({ token: adminToken } = await seedAuth({
      userId: 'usr-full-edit-admin',
      username: 'grn.full.edit.admin',
      role: 'ADMIN',
      facilityIds: [facilityId],
    }));
  });

  afterAll(disconnectTestDatabase);

  beforeEach(async () => {
    await resetStockCollections();

    await seedFacility({ id: facilityId, code: 'FULLEDIT', name: 'North Full-Edit Facility' });
    customerId = await seedCustomer({
      id: 'cust-full-edit',
      facilityId,
      name: 'Ramesh Patel',
    });

    const commodity = await CommodityModel.create({
      id: 'cmd-potato-full-edit',
      name: 'Potato Jyoti',
      normalizedName: 'potato jyoti full edit',
      isActive: true,
    });
    commodityId = commodity.id;

    grnId = await seedGrn({
      facilityId,
      customerId,
      commodityId,
      commodityName: 'Potato Jyoti',
      chamber: 'CH-01',
      bags: 200,
      rentAmount: 5000,
    });
  });

  function correct(body: Record<string, unknown>) {
    return request(app)
      .patch(`/api/facilities/${facilityId}/grns/${grnId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send(body);
  }

  function storedGrn() {
    return request(app)
      .get(`/api/grns/${grnId}`)
      .set('Authorization', `Bearer ${adminToken}`);
  }

  it('full-edits customer, rent terms and logistics metadata on an OPEN receipt', async () => {
    const newCustomerId = await seedCustomer({ facilityId, name: 'New Customer Full Edit' });
    const res = await correct({
      customerId: newCustomerId,
      vehicleNumber: 'UP32AA1111',
      remarks: 'Updated via full edit',
      partyMark: 'PM-1',
      gpNumber: 'GP-99',
      rentAmount: 6000,
      reason: 'Full edit of identity and logistics fields',
    });
    expect(res.status).toBe(200);

    const stored = await storedGrn();
    expect(stored.body.grn.customerId).toBe(newCustomerId);
    expect(stored.body.grn.vehicleNumber).toBe('UP32AA1111');
    expect(stored.body.grn.remarks).toBe('Updated via full edit');
    expect(stored.body.grn.rentAmount).toBe(6000);
  });

  it('edits bag type and per-bag weights on an OPEN receipt', async () => {
    const res = await correct({
      bagType: 'B',
      bags: 150,
      smallBagWeight: null,
      bigBagWeight: 80,
      reason: 'Re-weighed as big bags at inward',
    });
    expect(res.status).toBe(200);

    const stored = await storedGrn();
    expect(stored.body.grn.bagType).toBe('B');
    expect(stored.body.grn.bags).toBe(150);
    expect(stored.body.grn.bigBagWeight).toBe(80);
  });

  it('rejects a future inward date', async () => {
    const res = await correct({
      date: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      reason: 'Trying to postdate the receipt',
    });
    expect(res.status).toBe(400);
  });

  it('refuses to reduce rent below already-collected payments', async () => {
    // Payments are immutable and receipt numbers are facility-scoped, so this case
    // runs in its own facility like grn-correction-movement.test.ts does.
    const tag = `${Date.now()}-rent-guard`;
    const payFacilityId = await seedFacility({ name: `Full-Edit Rent Guard ${tag}` });
    const payCustomerId = await seedCustomer({ facilityId: payFacilityId, name: 'Rent Guard Farmer' });
    const payGrnId = await seedGrn({
      facilityId: payFacilityId,
      customerId: payCustomerId,
      commodityId,
      commodityName: 'Potato Jyoti',
      chamber: 'CH-01',
      bags: 200,
      rentAmount: 5000,
    });
    const { token: payToken } = await seedAuth({
      userId: `usr-full-edit-rent-${tag}`,
      username: `grn.full.edit.rent.${tag}`,
      role: 'ADMIN',
      facilityIds: [payFacilityId],
    });
    await rentService.recordPayment(
      payFacilityId,
      { grnId: payGrnId, amountPaid: 5000, paymentMode: 'Cash', paymentDate: new Date() },
      `usr-full-edit-rent-${tag}`,
    );

    const res = await request(app)
      .patch(`/api/facilities/${payFacilityId}/grns/${payGrnId}`)
      .set('Authorization', `Bearer ${payToken}`)
      .send({ rentAmount: 1000, reason: 'Trying to lower rent below collections' });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('already been collected');
  });

  it('rejects an inactive customer on full edit', async () => {
    const inactiveId = await seedCustomer({ facilityId, name: 'Inactive Full Edit' });
    await CustomerModel.updateOne({ id: inactiveId }, { isActive: false }).exec();

    const res = await correct({
      customerId: inactiveId,
      reason: 'Trying to move receipt to inactive customer',
    });
    expect(res.status).toBe(409);
    expect(res.body.error).toContain('is inactive');
  });
});
