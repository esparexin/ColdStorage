import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../app.js';
import { config } from '../config.js';
import { CommodityModel } from '../database/models/commodity.model.js';
import { GrnModel } from '../database/models/grn.model.js';
import { createAuthSeeder } from './helpers/auth-fixtures.js';
import { seedCustomer, seedFacility } from './helpers/master-data-fixtures.js';
import { grnService } from '../modules/grn/grn.service.js';
import {
  connectToTestDatabase,
  disconnectTestDatabase,
  resetStockCollections,
} from './helpers/stock-reset.js';

const app = createApp();
const seedAuth = createAuthSeeder(config.jwtSecret);
const facilityId = 'fac-grn-manual-entry';

describe('Manual GR Number Entry Rules', () => {
  let operatorToken: string;
  let customerId: string;
  let commodityId: string;

  beforeAll(async () => {
    await connectToTestDatabase();
  });

  afterAll(disconnectTestDatabase);

  beforeEach(async () => {
    await resetStockCollections();
    await seedFacility({ id: facilityId, code: 'MGRN', name: 'Manual GRN Facility' });
    customerId = await seedCustomer({ id: 'cust-grn-manual-01', facilityId, name: 'Ramesh Patel' });
    const commodity = await CommodityModel.create({
      id: 'cmd-potato-manual',
      name: 'Potato Jyoti',
      normalizedName: 'potato jyoti manual',
      isActive: true,
    });
    commodityId = commodity.id;
    ({ token: operatorToken } = await seedAuth({
      userId: 'usr-grn-manual',
      username: 'operator.grn.manual',
      role: 'OPERATOR',
      facilityIds: [facilityId],
    }));
  });

  function payload(overrides: Record<string, unknown> = {}) {
    return {
      grnNumber: '0001',
      date: new Date().toISOString(),
      customerId,
      commodityId,
      chamber: 'CH-M01',
      bags: 100,
      bagType: 'S',
      rentType: 'Seasonal',
      rentAmount: 5000,
      ...overrides,
    };
  }

  function postGrn(body: Record<string, unknown>) {
    return request(app)
      .post(`/api/facilities/${facilityId}/grns`)
      .set('Authorization', `Bearer ${operatorToken}`)
      .send(body);
  }

  describe('four-digit format', () => {
    it.each([
      ['too short', '12'],
      ['too long', '12345'],
      ['letters', '12ab'],
      ['padded with spaces', '  12  '],
      ['empty', ''],
    ])('rejects a GR Number that is %s', async (_label, grnNumber) => {
      const res = await postGrn(payload({ grnNumber }));

      expect(res.status).toBe(400);
      expect(res.body.details?.fieldErrors?.grnNumber).toBeDefined();
    });

    it('accepts a four-digit GR Number and stores it verbatim', async () => {
      const res = await postGrn(payload({ grnNumber: '0007' }));

      expect(res.status).toBe(201);
      expect(res.body.grn.grnNumber).toBe('0007');
    });

    it('accepts any unused four-digit GR Number, not only the suggested one', async () => {
      const first = await postGrn(payload({ grnNumber: '0001' }));
      expect(first.status).toBe(201);

      // 0002 is the suggested next value; 0005 is skipped but still valid.
      const skipped = await postGrn(payload({ grnNumber: '0005' }));

      expect(skipped.status).toBe(201);
      expect(skipped.body.grn.grnNumber).toBe('0005');
    });
  });

  describe('per-facility uniqueness', () => {
    it('rejects a duplicate GR Number in the same facility with 409', async () => {
      const first = await postGrn(payload({ grnNumber: '0003' }));
      expect(first.status).toBe(201);

      const duplicate = await postGrn(payload({ grnNumber: '0003' }));

      expect(duplicate.status).toBe(409);
      expect(duplicate.body.error).toContain('0003');
      expect(duplicate.body.error).toContain('already exists');
      expect(await GrnModel.countDocuments({ facilityId, grnNumber: '0003' })).toBe(1);
    });

    it('allows the same GR Number in a different facility', async () => {
      const otherFacilityId = 'fac-grn-manual-02';
      await seedFacility({ id: otherFacilityId, code: 'MGRN2', name: 'Second Manual Facility' });
      const otherCustomerId = await seedCustomer({
        id: 'cust-grn-manual-02',
        facilityId: otherFacilityId,
        name: 'Sita Devi',
      });
      const { token: otherToken } = await seedAuth({
        userId: 'usr-grn-manual-02',
        username: 'operator.grn.manual2',
        role: 'OPERATOR',
        facilityIds: [otherFacilityId],
      });

      const inFirst = await postGrn(payload({ grnNumber: '0004' }));
      expect(inFirst.status).toBe(201);

      const inSecond = await request(app)
        .post(`/api/facilities/${otherFacilityId}/grns`)
        .set('Authorization', `Bearer ${otherToken}`)
        .send(payload({ grnNumber: '0004', customerId: otherCustomerId, chamber: 'CH-M02' }));

      expect(inSecond.status).toBe(201);
      expect(inSecond.body.grn.grnNumber).toBe('0004');
    });
  });

  describe('informational guidance', () => {
    it('reports no last created GRN for an empty facility', async () => {
      const guidance = await grnService.getGrnNumberGuidance(facilityId);

      expect(guidance.lastCreatedGrn).toBeNull();
      expect(guidance.nextGrn).toBe('0001');
    });

    it('suggests one above the highest four-digit GR Number in the facility', async () => {
      await postGrn(payload({ grnNumber: '0002' }));
      await postGrn(payload({ grnNumber: '0012' }));

      const guidance = await grnService.getGrnNumberGuidance(facilityId);

      expect(guidance.lastCreatedGrn).toBe('0012');
      expect(guidance.nextGrn).toBe('0013');
    });

    it('ignores legacy GRN-26-27-NNNN values when deriving guidance', async () => {
      await GrnModel.create({
        id: 'grn-legacy-shape',
        facilityId,
        grnNumber: 'GRN-26-27-0099',
        inwardReceiptNumber: 'RCPT-26-27-0099',
        date: new Date(),
        customerId,
        customerName: 'Ramesh Patel',
        commodityId,
        commodityName: 'Potato Jyoti',
        chamber: 'CH-L01',
        bags: 50,
        bagType: 'S',
        smallBags: 50,
        bigBags: 0,
        rentType: 'Seasonal',
        rentMonths: 10,
        rentAmount: 1000,
        status: 'OPEN',
        isBondForLoan: false,
        loanStatus: 'NONE',
        createdBy: 'usr-grn-manual',
      });

      const guidance = await grnService.getGrnNumberGuidance(facilityId);

      expect(guidance.lastCreatedGrn).toBeNull();
      expect(guidance.nextGrn).toBe('0001');
    });

    it('never blocks entry: guidance is advisory, so a gap can be filled later', async () => {
      await postGrn(payload({ grnNumber: '0012' }));
      // Guidance says 0013, but the operator may instead fill an earlier gap.
      const gapFill = await postGrn(payload({ grnNumber: '0009' }));

      expect(gapFill.status).toBe(201);
    });
  });

  describe('bag type is informational', () => {
    it('accepts S&B without any small/big split', async () => {
      const res = await postGrn(payload({ grnNumber: '0006', bagType: 'S+B' }));

      expect(res.status).toBe(201);
      // The stored composition stays defined so delivery/ledger readers keep working.
      expect(res.body.grn.bags).toBe(100);
      expect(res.body.grn.smallBags).toBe(100);
      expect(res.body.grn.bigBags).toBe(0);
    });

    it('still rejects an S+B split that contradicts the declared total', async () => {
      const res = await postGrn(
        payload({ grnNumber: '0008', bagType: 'S+B', smallBags: 60, bigBags: 90 }),
      );

      expect(res.status).toBe(400);
    });

    it('accepts S&B whose split does reconcile with the total', async () => {
      const res = await postGrn(
        payload({ grnNumber: '0010', bagType: 'S+B', smallBags: 60, bigBags: 40 }),
      );

      expect(res.status).toBe(201);
      expect(res.body.grn.smallBags).toBe(60);
      expect(res.body.grn.bigBags).toBe(40);
    });
  });
});