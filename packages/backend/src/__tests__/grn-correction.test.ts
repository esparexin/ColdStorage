import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../app.js';
import { config } from '../config.js';
import { CommodityModel } from '../database/models/commodity.model.js';
import { AuditLogModel } from '../database/models/audit-log.model.js';
import { GrnModel } from '../database/models/grn.model.js';
import { InventoryTransactionModel } from '../database/models/inventory-transaction.model.js';
import { createAuthSeeder } from './helpers/auth-fixtures.js';
import { seedChallan, seedCustomer, seedFacility, seedGrn } from './helpers/master-data-fixtures.js';
import {
  connectToTestDatabase,
  disconnectTestDatabase,
  resetStockCollections,
} from './helpers/stock-reset.js';

const app = createApp();
const seedAuth = createAuthSeeder(config.jwtSecret);

const facilityId = 'fac-north-correct';

/**
 * Chamber is free text and the ledger is immutable, so an inward receipt may only be corrected
 * by the `grn:correct` workflow, and only while nothing has moved against it.
 */
describe('GRN Correction Workflow (PATCH /api/facilities/:facilityId/grns/:grnId)', () => {
  let adminToken: string;
  let customerId: string;
  let commodityId: string;
  let grnId: string;

  beforeAll(async () => {
    await connectToTestDatabase();

    ({ token: adminToken } = await seedAuth({
      userId: 'usr-correct-admin',
      username: 'grn.correct.admin',
      role: 'ADMIN',
      facilityIds: [facilityId],
    }));
  });

    afterAll(disconnectTestDatabase);

  beforeEach(async () => {
    await resetStockCollections();

    await seedFacility({ id: facilityId, code: 'CORRECT', name: 'North Cold Facility' });
    customerId = await seedCustomer({
      id: 'cust-correct',
      facilityId,
      name: 'Ramesh Patel',
    });

    const commodity = await CommodityModel.create({
      id: 'cmd-potato-correct',
      name: 'Potato Jyoti',
      normalizedName: 'potato jyoti correct',
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

  /** Reads the receipt back through the read API, which is the record the ledger now agrees with. */
  function storedGrn() {
    return request(app)
      .get(`/api/grns/${grnId}`)
      .set('Authorization', `Bearer ${adminToken}`);
  }

  it('corrects commodity, bag count and chamber on an OPEN receipt', async () => {
    await GrnModel.updateOne(
      { id: grnId },
      { $set: { smallBagWeight: 50 } },
    );
    await CommodityModel.create({
      id: 'cmd-onion-correct',
      name: 'Onion Nashik',
      normalizedName: 'onion nashik correct',
      isActive: true,
    });

    const res = await correct({
      commodityId: 'cmd-onion-correct',
      bags: 180,
      chamber: '  CH-07  ',
      reason: 'Operator mis-keyed the lot at inward',
    });
    expect(res.status).toBe(200);

    const stored = await storedGrn();
    expect(stored.status).toBe(200);
    expect(stored.body.grn.commodityId).toBe('cmd-onion-correct');
    expect(stored.body.grn.commodityName).toBe('Onion Nashik');
    expect(stored.body.grn.bags).toBe(180);
    expect(stored.body.grn.smallBags).toBe(180);
    expect(stored.body.grn.bigBags).toBe(0);
    expect(stored.body.grn.chamber).toBe('CH-07');
    // The inward ledger leg is part of the receipt: it moves with the correction, atomically.
    const inward = await InventoryTransactionModel.findOne({
      grnId,
      transactionType: 'INWARD_PUTAWAY',
    })
      .lean()
      .exec();
    expect(inward?.smallQuantity).toBe(180);
    expect(inward?.bigQuantity).toBe(0);
    // Rent terms are financial facts and are not correctable through this workflow.
    expect(stored.body.grn.rentAmount).toBe(5000);
    expect(stored.body.grn.rentType).toBe('Seasonal');
    expect(stored.body.grn.status).toBe('OPEN');
  });

  it('requires a correction reason of at least 5 characters', async () => {
    const res = await correct({ bags: 180, reason: 'fix' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Validation failed');
    expect(res.body.details.fieldErrors.reason).toBeDefined();
  });

  it('requires at least one correctable field and rejects unknown keys', async () => {
    const noField = await correct({ reason: 'Nothing actually changes here' });
    expect(noField.status).toBe(400);

    const unknownKey = await correct({ grnNumber: 'GRN-99', reason: 'Trying to change the key' });
    expect(unknownKey.status).toBe(400);
    expect(unknownKey.body.error).toBe('Validation failed');
  });

  it('rejects every permanently immutable numbering/lien field as unknown', async () => {
    const frozen = [
      { grnNumber: 'GRN-99' }, { inwardReceiptNumber: 'RCPT-99' }, { billNumber: 'B-99' },
      { loanStatus: 'TAKEN' }, { bondNumber: 'BND-1' }, { status: 'CLOSED' },
      { facilityId: 'fac-other' }, { isBondForLoan: true },
    ];
    for (const extra of frozen) {
      const res = await correct({ ...extra, reason: 'Trying to change a frozen field' });
      expect(res.status).toBe(400);
    }
  });

  it('rejects a split correction that names only one side', async () => {
    const res = await correct({ smallBags: 100, reason: 'Correcting only the small side' });
    expect(res.status).toBe(400);
  });

  it('requires authentication', async () => {
    const res = await request(app)
      .patch(`/api/facilities/${facilityId}/grns/${grnId}`)
      .send({ chamber: 'CH-02', reason: 'No token supplied' });
    expect(res.status).toBe(401);
  });

  it('backfills a missing inward ledger leg during correction', async () => {
    await InventoryTransactionModel.deleteMany({ grnId, transactionType: 'INWARD_PUTAWAY' }).exec();

    const res = await correct({ bags: 180, reason: 'Correcting a pre-ledger receipt' });
    expect(res.status).toBe(200);

    const inward = await InventoryTransactionModel.findOne({ grnId, transactionType: 'INWARD_PUTAWAY' })
      .lean()
      .exec();
    expect(inward?.smallQuantity).toBe(180);
    expect(String(inward?.notes ?? '')).toContain('Backfilled by correction');
  });

  it('rejects a correction naming an inactive commodity', async () => {
    await CommodityModel.updateOne({ id: commodityId }, { isActive: false });

    const res = await correct({ commodityId, reason: 'Re-keying the commodity' });

    expect(res.status).toBe(409);
    expect(res.body.error).toContain('is inactive');
  });

  it('refuses to correct a CLOSED receipt', async () => {
    await GrnModel.updateOne({ id: grnId }, { $set: { status: 'CLOSED' } });

    const res = await correct({ bags: 180, reason: 'Stock already fully delivered' });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('it is CLOSED');
  });

  it('refuses to correct a receipt whose stock has already been delivered', async () => {
    await seedChallan({
      facilityId,
      customerId,
      grnId,
      grnNumber: 'GRN-26-27-0001',
      chamber: 'CH-01',
      smallBags: 40, bigBags: 0,
      status: 'ISSUED',
    });

    const res = await correct({ bags: 180, reason: 'Re-counting after delivery' });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('stock has already been delivered');
  });

  it('still corrects an open receipt before any delivery', async () => {
    const res = await correct({ chamber: 'CH-09', reason: 'Relabelling before any outward' });
    expect(res.status).toBe(200);

    const stored = await storedGrn();
    expect(stored.body.grn.chamber).toBe('CH-09');
  });

  it('emits a GRN_CORRECTED audit record with before/after state and reason', async () => {
    const res = await correct({ bags: 180, chamber: 'CH-07', reason: 'Operator mis-keyed the lot' });
    expect(res.status).toBe(200);

    const record = await AuditLogModel.findOne({ eventType: 'GRN_CORRECTED', resourceId: grnId })
      .lean()
      .exec();
    expect(record).toBeDefined();
    expect(record?.severity).toBe('WARN');
    expect(record?.details?.reason).toBe('Operator mis-keyed the lot');
    expect(record?.details?.before).toMatchObject({ bags: 200, chamber: 'CH-01' });
    expect(record?.details?.after).toMatchObject({ bags: 180, chamber: 'CH-07' });
  });
});
