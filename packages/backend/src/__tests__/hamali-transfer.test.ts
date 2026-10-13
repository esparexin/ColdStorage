import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import mongoose from 'mongoose';
import { connectToDatabase, disconnectDatabase } from '../database/connection.js';
import { CommodityModel } from '../database/models/commodity.model.js';
import { CommodityRateModel } from '../database/models/commodity-rate.model.js';
import { CustomerModel } from '../database/models/customer.model.js';
import { FacilityModel } from '../database/models/facility.model.js';
import { GrnModel } from '../database/models/grn.model.js';
import { InventoryTransactionModel } from '../database/models/inventory-transaction.model.js';
import { InternalMovementModel } from '../database/models/internal-movement.model.js';
import { createGrn } from '../modules/grn/handlers/create-grn.handler.js';
import { createDeliveryWithRetry } from '../modules/delivery/handlers/create-delivery.handler.js';
import { computeExpectedDeliveryRent } from '../modules/delivery/handlers/delivery-rent.helper.js';
import { readLedgerBalance } from '../modules/inventory/ledger-balance.js';
import { internalMovementService } from '../modules/internal-movement/internal-movement.service.js';

/**
 * Phase 4 — Ownership-transfer hamali (feat/hamali-accounting-integrity).
 * Carry-only: GRN keeps stored rate/amount; movement carries the obligation;
 * no new charge, rent gates and customer validation unchanged.
 */
describe('Ownership transfer hamali — carry only', () => {
  const facilityId = 'fac-hamali-own';
  const userId = 'usr-hamali-own';
  const originalEnv = process.env.ALLOW_HISTORICAL_TESTING_DATES;
  let customerA = 'cust-own-a';
  let customerB = 'cust-own-b';
  let customerC = 'cust-own-c';

  beforeAll(async () => {
    process.env.ALLOW_HISTORICAL_TESTING_DATES = 'true';
    await connectToDatabase();
  });

  afterAll(async () => {
    if (originalEnv !== undefined) process.env.ALLOW_HISTORICAL_TESTING_DATES = originalEnv;
    else delete process.env.ALLOW_HISTORICAL_TESTING_DATES;
    await disconnectDatabase();
  });

  beforeEach(async () => {
    await FacilityModel.deleteMany({});
    await CustomerModel.deleteMany({});
    await CommodityModel.deleteMany({});
    await CommodityRateModel.deleteMany({});
    await GrnModel.deleteMany({});
    await InventoryTransactionModel.deleteMany({});
    await InternalMovementModel.deleteMany({});
    await mongoose.connection.collection('rentpayments').deleteMany({});
    await FacilityModel.create({ id: facilityId, name: 'Own Facility', code: 'OWN', isActive: true });
    for (const [id, name] of [[customerA, 'Owner A'], [customerB, 'Owner B'], [customerC, 'Owner C']] as const) {
      await CustomerModel.create({ id, name, facilityIds: [facilityId], isActive: true });
    }
    await CommodityModel.create({
      id: 'cmd-own', name: 'Own Potato', normalizedName: 'own potato',
      seasonDuration: 'Seasonal', isHamaliApplicable: true, hamaliRate: 4, isActive: true,
    });
    // No Controller rows here: with no GRN bag prices either, the rent gate
    // resolves to ₹0 so transfers isolate hamali carry (Controller hamali stays ignored).
  });

  let seq = 0;
  async function makeGrn(bags = 100, hamaliRate?: number) {
    seq += 1;
    // No bag prices / zero rent: keeps the rent-settlement gate at ₹0 so the
    // tests isolate hamali carry behavior (rent gates covered elsewhere).
    const { grn } = await createGrn(
      facilityId,
      {
        grnNumber: `${8000 + seq}`, date: new Date('2026-01-05'), customerId: customerA, commodityId: 'cmd-own',
        chamber: 'CH-1', bags, bagType: 'S', rentType: 'Seasonal', rentAmount: 0,
        ...(hamaliRate !== undefined ? { hamaliRate } : {}),
      },
      userId,
      { requireRates: false },
    );
    return grn;
  }

  it('carries hamali unchanged to the new owner with no new charge', async () => {
    const grn = await makeGrn(100);
    expect(grn.hamaliAmount).toBe(400);
    const { grn: updated, movement } = await transferSettled(grn.id, customerB, new Date('2026-02-01'), 'Sold lot to B');
    expect(updated.customerId).toBe(customerB);
    expect(updated.hamaliRate).toBe(4);
    expect(updated.hamaliAmount).toBe(400);
    expect(movement.hamaliBags).toBe(0);
    expect(movement.hamaliCharge).toBe(0);
    expect(movement.hamaliCarried).toBe(400);
    expect(movement.hamaliRate).toBe(4);
    expect(movement.financialSnapshot.hamaliAmount).toBe(400);
    const persisted = await GrnModel.findOne({ id: grn.id }).lean().exec();
    expect(persisted?.hamaliAmount).toBe(400);
  });

  it('carries zero hamali for zero-rate GRNs and preserves rent settlement gates', async () => {
    const grn = await makeGrn(50, 0);
    const { movement } = await transferSettled(grn.id, customerB, new Date('2026-02-01'), 'Zero hamali transfer');
    expect(movement.hamaliCarried).toBe(0);
    expect(movement.hamaliCharge).toBe(0);
    expect(movement.financialSnapshot.hamaliAmount).toBe(0);
  });

  it('keeps historical rate after commodity changes and never duplicates on repeat transfer', async () => {
    const grn = await makeGrn(100);
    await createDeliveryWithRetry(facilityId, { grnId: grn.id, smallBags: 20, bigBags: 0 }, userId);
    await CommodityModel.updateOne({ id: 'cmd-own' }, { $set: { hamaliRate: 10 } });
    const first = await transferSettled(grn.id, customerB, new Date('2026-02-01'), 'First transfer keeps history');
    expect(first.movement.hamaliRate).toBe(4);
    expect(first.movement.hamaliCarried).toBe(400);
    expect(first.grn.hamaliAmount).toBe(400);
    const second = await transferSettled(grn.id, customerC, new Date('2026-02-02'), 'Second transfer still single carry');
    expect(second.grn.hamaliAmount).toBe(400);
    expect(second.movement.hamaliCarried).toBe(400);
    expect(second.movement.hamaliCharge).toBe(0);
    await expect(
      internalMovementService.transferOwnership(
        facilityId,
        { grnId: grn.id, newCustomerId: customerC, movementDate: new Date('2026-02-03'), remarks: 'Same customer rejected', paymentDecision: 'AGREED_PENDING' },
        userId,
      ),
    ).rejects.toThrow(/different from current customer/);
  });

  async function transferSettled(grnId: string, newCustomerId: string, movementDate: Date, remarks: string) {
    const grnDoc = await GrnModel.findOne({ id: grnId }).lean().exec();
    if (!grnDoc) throw new Error(`GRN '${grnId}' not found in test`);
    const bal = await readLedgerBalance(facilityId, grnId);
    const session = await mongoose.startSession();
    let expected = 0;
    try {
      const r = await computeExpectedDeliveryRent({
        grn: {
          id: grnDoc.id, date: grnDoc.date, rentType: grnDoc.rentType, commodityId: grnDoc.commodityId,
          smallBagPrice: grnDoc.smallBagPrice ?? null, bigBagPrice: grnDoc.bigBagPrice ?? null,
          bagPrice: grnDoc.bagPrice ?? null,
        },
        withdrawal: { smallBags: bal.smallBags, bigBags: bal.bigBags },
        deliveryDate: movementDate,
        session,
      });
      expected = r.expectedRentCharge;
    } finally {
      await session.endSession();
    }
    if (expected > 0) {
      return internalMovementService.transferOwnership(
        facilityId,
        {
          grnId, newCustomerId, movementDate, remarks,
          paymentDecision: 'SETTLE_NOW',
          settlementDetails: { amountPaid: expected, paymentMode: 'Cash' },
        },
        userId,
      );
    }
    return internalMovementService.transferOwnership(
      facilityId,
      { grnId, newCustomerId, movementDate, remarks, paymentDecision: 'AGREED_PENDING' },
      userId,
    );
  }
});
