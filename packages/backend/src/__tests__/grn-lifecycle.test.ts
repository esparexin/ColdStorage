import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../app.js';
import { config } from '../config.js';
import { CommodityModel } from '../database/models/commodity.model.js';
import { createAuthSeeder } from './helpers/auth-fixtures.js';
import { SEASONAL_MONTHS, seedCustomer, seedFacility } from './helpers/master-data-fixtures.js';
import {
  connectToTestDatabase,
  disconnectTestDatabase,
  resetStockCollections,
} from './helpers/stock-reset.js';

const app = createApp();
const seedAuth = createAuthSeeder(config.jwtSecret);

const northFacilityId = 'fac-north-lifecycle';
const southFacilityId = 'fac-south-lifecycle';

describe('GRN Lifecycle & Sequences Integration', () => {
  let operatorNorthToken: string;
  let customerNorthId: string;
  let commodityId: string;

  beforeAll(async () => {
    await connectToTestDatabase();

    ({ token: operatorNorthToken } = await seedAuth({
      userId: 'usr-grn-life-op',
      username: 'life.op.north',
      role: 'OPERATOR',
      facilityIds: [northFacilityId],
    }));
  });

    afterAll(disconnectTestDatabase);

  beforeEach(async () => {
    await resetStockCollections();

    await seedFacility({ id: northFacilityId, code: 'NORTHL', name: 'North Cold Facility' });
    await seedFacility({ id: southFacilityId, code: 'SOUTHL', name: 'South Cold Facility' });

    customerNorthId = await seedCustomer({
      id: 'cust-ramesh-life',
      facilityId: northFacilityId,
      name: 'Ramesh Patel',
    });

    const commodity = await CommodityModel.create({
      id: 'cmd-potato-life',
      name: 'Potato Jyoti',
      normalizedName: 'potato jyoti life',
      isActive: true,
    });
    commodityId = commodity.id;
  });

  /** Chamber is free text now, so an inbound needs no storage entity seeded beforehand. */
  function inbound(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
      customerId: customerNorthId,
      commodityId,
      chamber: 'CH-NORTH-01',
      bags: 100,
      bagType: 'S',
      smallBagWeight: 50,
      rentType: 'Seasonal',
      rentAmount: 1000,
      ...overrides,
    };
  }

  function postInbound(body: Record<string, unknown>) {
    return request(app)
      .post(`/api/facilities/${northFacilityId}/grns`)
      .set('Authorization', `Bearer ${operatorNorthToken}`)
      .send(body);
  }

  it('creates GRN with atomic independent sequences for grnNumber and inwardReceiptNumber', async () => {
    const res = await postInbound(
      inbound({
        bags: 250,
        smallBagWeight: 50,
        rentType: 'Monthly',
        rentMonths: 4,
        rentAmount: 3750,
        gpNumber: 'GP-2026-X8',
        marks: 'LOT-A-RED',
        vehicleNumber: 'MH12AB1234',
        remarks: 'Stored in good condition',
      }),
    );

    expect(res.status).toBe(201);
    const { grn, acknowledgement } = res.body;

    expect(grn.id).toBeDefined();
    expect(grn.facilityId).toBe(northFacilityId);
    expect(grn.grnNumber).toMatch(/^GRN-\d{2}-\d{2}-0001$/);
    expect(grn.inwardReceiptNumber).toMatch(/^RCPT-\d{2}-\d{2}-0001$/);
    expect(grn.status).toBe('OPEN');
    expect(grn.customerName).toBe('Ramesh Patel');
    expect(grn.commodityName).toBe('Potato Jyoti');
    expect(grn.chamber).toBe('CH-NORTH-01');
    expect(grn.bags).toBe(250);
    expect(grn.smallBagWeight).toBe(50);
    expect(grn.rentType).toBe('Monthly');
    expect(grn.rentMonths).toBe(4);
    expect(grn.rentAmount).toBe(3750);

    expect(acknowledgement.grnId).toBe(grn.id);
    expect(acknowledgement.grnNumber).toBe(grn.grnNumber);
    expect(acknowledgement.inwardReceiptNumber).toBe(grn.inwardReceiptNumber);
    expect(acknowledgement.customer.name).toBe('Ramesh Patel');
    expect(acknowledgement.storageLocation.chamber).toBe('CH-NORTH-01');
    expect(acknowledgement.bagAccounting.smallBagWeight).toBe(50);

    const res2 = await postInbound(
      inbound({ bags: 100, bagType: 'B', bigBagWeight: 80, rentAmount: 2000 }),
    );

    expect(res2.status).toBe(201);
    expect(res2.body.grn.grnNumber).toMatch(/^GRN-\d{2}-\d{2}-0002$/);
    expect(res2.body.grn.inwardReceiptNumber).toMatch(/^RCPT-\d{2}-\d{2}-0002$/);
    // Seasonal is a fixed 10-month period derived server-side, never operator input.
    expect(res2.body.grn.rentMonths).toBe(SEASONAL_MONTHS);
    expect(res2.body.acknowledgement.rentTerms.rentMonths).toBe(SEASONAL_MONTHS);
  });

  it('rejects conflicting facilityId in request body', async () => {
    const res = await postInbound(inbound({ facilityId: southFacilityId }));

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('does not match route facilityId');
  });

  it('rolls back transaction on relational failure with zero sequence gaps', async () => {
    const failRes = await postInbound(inbound({ commodityId: 'cmd-nonexistent' }));

    expect(failRes.status).toBe(400);
    expect(failRes.body.error).toContain('not found');

    const validRes = await postInbound(inbound());

    expect(validRes.status).toBe(201);
    expect(validRes.body.grn.grnNumber).toMatch(/^GRN-\d{2}-\d{2}-0001$/);
    expect(validRes.body.grn.inwardReceiptNumber).toMatch(/^RCPT-\d{2}-\d{2}-0001$/);
  });
  it('supports previewing next bill number and given custom bill number', async () => {
    const previewRes = await request(app)
      .get(`/api/facilities/${northFacilityId}/grns/next-bill-number`)
      .set('Authorization', `Bearer ${operatorNorthToken}`);

    expect(previewRes.status).toBe(200);
    expect(previewRes.body.nextBillNumber).toMatch(/^RCPT-\d{2}-\d{2}-0001$/);

    // Create GRN with custom operator-given bill number (e.g. RCPT-26-27-0050)
    const customRes = await postInbound(
      inbound({
        billNumber: 'RCPT-26-27-0050',
        storageMark: 'STRG-2026',
        partyMark: 'PRTY-ALPHA',
      }),
    );
    expect(customRes.status).toBe(201);
    expect(customRes.body.grn.billNumber).toBe('RCPT-26-27-0050');
    expect(customRes.body.grn.inwardReceiptNumber).toBe('RCPT-26-27-0050');
    expect(customRes.body.grn.storageMark).toBe('STRG-2026');
    expect(customRes.body.grn.partyMark).toBe('PRTY-ALPHA');

    // Duplicate bill number in same facility is rejected
    const dupRes = await postInbound(inbound({ billNumber: 'RCPT-26-27-0050' }));
    expect(dupRes.status).toBe(409);
    expect(dupRes.body.error).toContain('already exists');

    // Next auto-sequence should continue from 51
    const nextPreviewRes = await request(app)
      .get(`/api/facilities/${northFacilityId}/grns/next-bill-number`)
      .set('Authorization', `Bearer ${operatorNorthToken}`);
    expect(nextPreviewRes.status).toBe(200);
    expect(nextPreviewRes.body.nextBillNumber).toMatch(/^RCPT-\d{2}-\d{2}-0051$/);
  });
});
