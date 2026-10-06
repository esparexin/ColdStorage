import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../app.js';
import { config } from '../config.js';
import { CommodityModel } from '../database/models/commodity.model.js';
import { DeliveryChallanModel } from '../database/models/delivery-challan.model.js';
import { InventoryTransactionModel } from '../database/models/inventory-transaction.model.js';
import { deliveryService } from '../modules/delivery/delivery.service.js';
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

let tokenSeq = 0;

/**
 * Correction after movement. Bags and commodity freeze once the ledger has recorded the original
 * figures; only the chamber label may still change, and it propagates to every row that carries
 * it so grouped reports cannot disagree by source.
 *
 * Each test runs in its own facility: receipt numbers restart every test while payment rows
 * persist in the shared stock database, so a reused facility would collide on
 * (facilityId, receiptNumber) — and payments are immutable, so the collision cannot be wiped.
 */
describe('GRN Correction After Movement (grn-correction-movement.test.ts)', () => {
  let commodityId: string;

  beforeAll(connectToTestDatabase);

  afterAll(disconnectTestDatabase);

  beforeEach(async () => {
    await resetStockCollections();

    const commodity = await CommodityModel.create({
      id: 'cmd-potato-correct-move',
      name: 'Potato Jyoti',
      normalizedName: 'potato jyoti correct move',
      isActive: true,
    });
    commodityId = commodity.id;
  });

  /** A receipt with a fully reversed delivery on it, in a facility used by nothing else. */
  async function seedMovedGrn(): Promise<{ facilityId: string; grnId: string; token: string }> {
    const tag = `${Date.now()}-${tokenSeq++}`;
    const facilityId = await seedFacility({ name: `Movement Facility ${tag}` });
    const customerId = await seedCustomer({ facilityId, name: 'Movement Farmer' });
    const grnId = await seedGrn({
      facilityId,
      customerId,
      commodityId,
      commodityName: 'Potato Jyoti',
      chamber: 'CH-01',
      bags: 200,
      rentAmount: 5000,
    });
    const { token } = await seedAuth({
      userId: `usr-correct-move-${tag}`,
      username: `grn.correct.move.${tag}`,
      role: 'ADMIN',
      facilityIds: [facilityId],
    });
    await rentService.recordPayment(
      facilityId,
      { grnId, amountPaid: 5000, paymentMode: 'Cash', paymentDate: new Date() },
      `usr-correct-move-${tag}`,
    );
    const del = await deliveryService.createDelivery(
      facilityId,
      { grnId, smallBags: 40, bigBags: 0 },
      `usr-correct-move-${tag}`,
    );
    await deliveryService.reverseDelivery(
      facilityId,
      del.delivery.id,
      { reason: 'Buyer rejected the lot at the gate' },
      `usr-correct-move-${tag}`,
    );
    return { facilityId, grnId, token };
  }

  function correctFor(
    facilityId: string,
    grnId: string,
    token: string,
    body: Record<string, unknown>,
  ) {
    return request(app)
      .patch(`/api/facilities/${facilityId}/grns/${grnId}`)
      .set('Authorization', `Bearer ${token}`)
      .send(body);
  }

  it('refuses bags or commodity changes once stock has moved, even after full reversal', async () => {
    const { facilityId, grnId, token } = await seedMovedGrn();

    const res = await correctFor(facilityId, grnId, token, {
      bags: 180,
      reason: 'Re-counting after a return',
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Only the chamber label may still be corrected');
  });

  it('propagates a chamber correction to the inward leg and the reversed challan', async () => {
    const { facilityId, grnId, token } = await seedMovedGrn();

    const res = await correctFor(facilityId, grnId, token, {
      chamber: 'CH-07',
      reason: 'Relabelling the bay after repainting',
    });
    expect(res.status).toBe(200);

    const inward = await InventoryTransactionModel.findOne({
      grnId,
      transactionType: 'INWARD_PUTAWAY',
    })
      .lean()
      .exec();
    expect(inward?.chamber).toBe('CH-07');
    const challan = await DeliveryChallanModel.findOne({ grnId }).lean().exec();
    expect(challan?.chamber).toBe('CH-07');

    const summary = await deliveryService.getDeliverySummary(facilityId, grnId);
    expect(summary.remainingDeliveryBalance).toBe(200);
  });

  it('leaves settled outward/reversal ledger rows on the original chamber', async () => {
    const { facilityId, grnId, token } = await seedMovedGrn();

    const res = await correctFor(facilityId, grnId, token, {
      chamber: 'CH-07',
      reason: 'Relabelling the bay after repainting',
    });
    expect(res.status).toBe(200);

    // The chamber label moves with live rows only; settled history keeps the
    // chamber the stock physically sat in when the event was recorded.
    const settled = await InventoryTransactionModel.find({
      grnId,
      transactionType: { $in: ['OUTWARD_DELIVERY', 'DELIVERY_REVERSAL'] },
    })
      .lean()
      .exec();
    expect(settled.length).toBeGreaterThan(0);
    for (const row of settled) expect(row.chamber).toBe('CH-01');
  });
});
