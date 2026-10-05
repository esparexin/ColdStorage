import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../app.js';
import { config } from '../config.js';
import { CommodityModel } from '../database/models/commodity.model.js';
import { createAuthSeeder } from './helpers/auth-fixtures.js';
import { seedCustomer, seedFacility } from './helpers/master-data-fixtures.js';
import {
  connectToTestDatabase,
  disconnectTestDatabase,
  resetStockCollections,
} from './helpers/stock-reset.js';

const app = createApp();
const seedAuth = createAuthSeeder(config.jwtSecret);
const facilityId = 'fac-grn-bond-identity';

describe('GRN and Bond Identity Verification Tests', () => {
  let operatorToken: string;
  let customerId: string;
  let commodityId: string;
  const operatorUsername = 'operator.identity.test';
  const customerName = 'Ramesh Farmer';

  beforeAll(async () => {
    await connectToTestDatabase();
    ({ token: operatorToken } = await seedAuth({
      userId: 'usr-identity-op',
      username: operatorUsername,
      role: 'OPERATOR',
      facilityIds: [facilityId],
    }));
  });

  afterAll(disconnectTestDatabase);

  beforeEach(async () => {
    await resetStockCollections();
    await seedFacility({ id: facilityId, code: 'GBIFAC', name: 'Identity Test Facility' });

    customerId = await seedCustomer({
      id: 'cust-identity-01',
      facilityId,
      name: customerName,
    });

    const commodity = await CommodityModel.create({
      id: 'cmd-potato-identity',
      name: 'Potato Jyoti',
      normalizedName: 'potato jyoti identity',
      isActive: true,
    });
    commodityId = commodity.id;
  });

  function makeInwardPayload(overrides: Record<string, unknown> = {}) {
    return {
      date: new Date().toISOString(),
      customerId,
      commodityId,
      chamber: 'CH-ID-01',
      bags: 100,
      bagType: 'S',
      smallBagWeight: 50,
      rentType: 'Seasonal',
      rentAmount: 5000,
      bagPrice: 50,
      smallBags: 100,
      bigBags: 0,
      gpNumber: 'GP-ID1',
      storageMark: 'ST-ID1',
      partyMark: 'RF-ID1',
      ...overrides,
    };
  }

  it('preserves Customer != Username != GRN != Bond across multiple inward consignments', async () => {
    // Inward 1: Standard storage (no bond)
    const inwardRes1 = await request(app)
      .post(`/api/facilities/${facilityId}/grns`)
      .set('Authorization', `Bearer ${operatorToken}`)
      .send(makeInwardPayload({ isBondForLoan: false }));

    expect(inwardRes1.status).toBe(201);
    const grn1 = inwardRes1.body.grn;

    // Verify Inward 1 SSOT invariants
    expect(grn1.customerId).toBe(customerId);
    expect(grn1.customerName).toBe(customerName);
    expect(grn1.grnNumber).toMatch(/^GRN-\d{2}-\d{2}-\d{4}$/);
    expect(grn1.grnNumber).not.toBe(customerName);
    expect(grn1.grnNumber).not.toBe(operatorUsername);
    expect(grn1.bondNumber).toBeNull();
    expect(grn1.isBondForLoan).toBe(false);
    expect(grn1.loanStatus).toBe('NONE');

    // Inward 2: Second inward for same customer with bond loan
    const inwardRes2 = await request(app)
      .post(`/api/facilities/${facilityId}/grns`)
      .set('Authorization', `Bearer ${operatorToken}`)
      .send(makeInwardPayload({ isBondForLoan: true }));

    expect(inwardRes2.status).toBe(201);
    const grn2 = inwardRes2.body.grn;

    // Verify Inward 2 SSOT invariants: a unique GR Number and no second minted identifier
    expect(grn2.customerId).toBe(customerId);
    expect(grn2.id).not.toBe(grn1.id);
    expect(grn2.grnNumber).not.toBe(grn1.grnNumber);
    expect(grn2.grnNumber).toMatch(/^GRN-\d{2}-\d{2}-\d{4}$/);
    // The GR Number is the sole business key: no BND- number is minted per receipt.
    expect(grn2.bondNumber).toBeNull();
    expect(grn2.grnNumber).not.toBe(customerName);
    expect(grn2.grnNumber).not.toBe(operatorUsername);
    expect(grn2.isBondForLoan).toBe(true);
    expect(grn2.loanStatus).toBe('NOT_TAKEN');
  });

  it('keeps the GR Number the only minted identifier across multiple inwards', async () => {
    // Multiple standard inwards without bond should never conflict with each other
    const std1 = await request(app)
      .post(`/api/facilities/${facilityId}/grns`)
      .set('Authorization', `Bearer ${operatorToken}`)
      .send(makeInwardPayload({ isBondForLoan: false }));
    expect(std1.status).toBe(201);
    expect(std1.body.grn.bondNumber).toBeNull();

    const std2 = await request(app)
      .post(`/api/facilities/${facilityId}/grns`)
      .set('Authorization', `Bearer ${operatorToken}`)
      .send(makeInwardPayload({ isBondForLoan: false }));
    expect(std2.status).toBe(201);
    expect(std2.body.grn.bondNumber).toBeNull();

    // Every inward receives its own GR Number, bonded or not.
    expect(std2.body.grn.grnNumber).not.toBe(std1.body.grn.grnNumber);

    // Bonded inward: no bond number is generated, so none can collide.
    const bond1 = await request(app)
      .post(`/api/facilities/${facilityId}/grns`)
      .set('Authorization', `Bearer ${operatorToken}`)
      .send(makeInwardPayload({ isBondForLoan: true }));
    expect(bond1.status).toBe(201);
    expect(bond1.body.grn.bondNumber).toBeNull();
    expect(bond1.body.grn.grnNumber).toMatch(/^GRN-\d{2}-\d{2}-\d{4}$/);
    expect(bond1.body.grn.isBondForLoan).toBe(true);

    // A bond reference supplied by a legacy import is stored as reference text only.
    const legacyRef = await request(app)
      .post(`/api/facilities/${facilityId}/grns`)
      .set('Authorization', `Bearer ${operatorToken}`)
      .send(makeInwardPayload({ isBondForLoan: true, bondNumber: 'BND-PLEDGE-9001' }));
    expect(legacyRef.status).toBe(201);
    expect(legacyRef.body.grn.bondNumber).toBe('BND-PLEDGE-9001');
    expect(legacyRef.body.grn.grnNumber).not.toBe(legacyRef.body.grn.bondNumber);
  });

  it('anchors stock movement to grnId and distinguishes bond hold on outward delivery', async () => {
    const bondedInward = await request(app)
      .post(`/api/facilities/${facilityId}/grns`)
      .set('Authorization', `Bearer ${operatorToken}`)
      .send(makeInwardPayload({ isBondForLoan: true, loanStatus: 'TAKEN', bags: 50, smallBags: 50 }));
    expect(bondedInward.status).toBe(201);

    const grn = bondedInward.body.grn;

    // Movement history links stock by grnId and surfaces the GR Number
    const histRes = await request(app)
      .get(`/api/facilities/${facilityId}/grns/${grn.id}/movement-history`)
      .set('Authorization', `Bearer ${operatorToken}`);

    expect(histRes.status).toBe(200);
    expect(histRes.body.history.grnId).toBe(grn.id);
    expect(histRes.body.history.grnNumber).toBe(grn.grnNumber);
    expect(histRes.body.history.bondNumber).toBe(grn.bondNumber);
    expect(histRes.body.history.currentClosingBags).toBe(50);
    expect(histRes.body.history.isLoanHoldActive).toBe(true);

    // Outward delivery blocked, referenced by the GR Number
    const delRes = await request(app)
      .post(`/api/facilities/${facilityId}/deliveries`)
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({
        grnId: grn.id,
        date: new Date().toISOString(),
        smallBags: 10,
        bigBags: 0,
      });

    expect(delRes.status).toBe(400);
    expect(delRes.body.error).toContain(grn.grnNumber);
    expect(delRes.body.error).toContain('Outward blocked');
  });
});
