import mongoose from 'mongoose';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { connectToDatabase, disconnectDatabase } from '../database/connection.js';
import { CommodityModel } from '../database/models/commodity.model.js';
import { CommodityRateModel } from '../database/models/commodity-rate.model.js';
import { CustomerModel } from '../database/models/customer.model.js';
import { FacilityModel } from '../database/models/facility.model.js';
import { GrnModel } from '../database/models/grn.model.js';
import { InventoryTransactionModel } from '../database/models/inventory-transaction.model.js';
import { InternalMovementModel } from '../database/models/internal-movement.model.js';
import { DeliveryChallanModel } from '../database/models/delivery-challan.model.js';
import { createGrn } from '../modules/grn/handlers/create-grn.handler.js';
import { createDeliveryWithRetry } from '../modules/delivery/handlers/create-delivery.handler.js';
import { computeExpectedDeliveryRent } from '../modules/delivery/handlers/delivery-rent.helper.js';
import { internalMovementService } from '../modules/internal-movement/internal-movement.service.js';
import { rentService } from '../modules/rent/rent.service.js';
import { rentExtensionService } from '../modules/rent/rent-extension.service.js';

/**
 * First-season internal Hamali (feat/hamali-first-season-internal).
 * Hamali is rent math only: full one-time amount (grn.bags x live commodity
 * rate) joins totalDue while no SEASON renewal is finalized; never stored on
 * transaction records, never returned, never shown in transaction UI.
 */
describe('First-season internal hamali', () => {
  const facilityId = 'fac-hamali-fs';
  const customerId = 'cust-hamali-fs';
  const customerB = 'cust-hamali-fs-b';
  const userId = 'usr-hamali-fs';
  const originalEnv = process.env.ALLOW_HISTORICAL_TESTING_DATES;
  let seq = 0;

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
    await DeliveryChallanModel.deleteMany({});
    await mongoose.connection.collection('rentextensions').deleteMany({});
    await mongoose.connection.collection('rentpayments').deleteMany({});
    await FacilityModel.create({ id: facilityId, name: 'FS Facility', code: 'FS', isActive: true });
    await CustomerModel.create({ id: customerId, name: 'FS Farmer', facilityIds: [facilityId], isActive: true });
    await CustomerModel.create({ id: customerB, name: 'FS Buyer', facilityIds: [facilityId], isActive: true });
    await CommodityModel.create({
      id: 'cmd-fs', name: 'FS Potato', normalizedName: 'fs potato',
      seasonDuration: 'Seasonal', isHamaliApplicable: true, hamaliRate: 4, isActive: true,
    });
  });

  async function makeGrn(bags = 100, rentAmount?: number) {
    seq += 1;
    const { grn } = await createGrn(
      facilityId,
      {
        grnNumber: `${9000 + seq}`, date: new Date('2025-06-15'), customerId, commodityId: 'cmd-fs',
        chamber: 'CH-1', bags, bagType: 'S', rentType: 'Seasonal',
        bagPrice: 30, rentAmount: rentAmount ?? bags * 30,
      },
      userId,
      { requireRates: false },
    );
    return grn;
  }

  async function expectedRentOnly(grnId: string, smallBags: number, deliveryDate: Date) {
    const grnDoc = await GrnModel.findOne({ id: grnId }).lean().exec();
    const session = await mongoose.startSession();
    try {
      const { expectedRentCharge } = await computeExpectedDeliveryRent({
        grn: {
          id: grnDoc!.id, date: grnDoc!.date, rentType: grnDoc!.rentType, commodityId: grnDoc!.commodityId,
          smallBagPrice: grnDoc!.smallBagPrice ?? null, bigBagPrice: grnDoc!.bigBagPrice ?? null,
          bagPrice: grnDoc!.bagPrice ?? null,
        },
        withdrawal: { smallBags, bigBags: 0 },
        deliveryDate,
        session,
      });
      return expectedRentCharge;
    } finally {
      await session.endSession();
    }
  }

  it('includes the full one-time hamali in first-season total due without storing it', async () => {
    const grn = await makeGrn(100);
    expect('hamaliRate' in grn).toBe(false);
    expect('hamaliAmount' in grn).toBe(false);
    const summary = await rentService.getRentSummary(facilityId, grn.id);
    expect(summary.totalDue).toBe(3400); // 3000 rent + 400 hamali
    expect(summary.remainingBalance).toBe(3400);
    expect('hamaliRate' in summary).toBe(false);
    expect('hamaliAmount' in summary).toBe(false);
    const persisted = await GrnModel.findOne({ id: grn.id }).lean().exec();
    expect(persisted).not.toBeNull();
    expect('hamaliRate' in persisted!).toBe(false);
    expect('hamaliAmount' in persisted!).toBe(false);
  });

  it('resolves zero hamali when the commodity disables it', async () => {
    await CommodityModel.updateOne({ id: 'cmd-fs' }, { $set: { isHamaliApplicable: false, hamaliRate: 0 } });
    const grn = await makeGrn(100);
    const summary = await rentService.getRentSummary(facilityId, grn.id);
    expect(summary.totalDue).toBe(3000);
  });

  it('keeps hamali through January/February extensions but drops it at SEASON renewal', async () => {
    const grn = await makeGrn(100);
    await rentExtensionService.finalizeExtension(facilityId, { grnId: grn.id, seasonYear: 2025, period: 'JANUARY' }, userId);
    const jan = await rentService.getRentSummary(facilityId, grn.id);
    expect(jan.totalDue).toBe(3000 + jan.extensions.reduce((s, e) => s + e.finalAmount, 0) + 400);
    await rentExtensionService.finalizeExtension(facilityId, { grnId: grn.id, seasonYear: 2025, period: 'FEBRUARY' }, userId);
    await rentExtensionService.finalizeExtension(facilityId, { grnId: grn.id, seasonYear: 2026, period: 'SEASON' }, userId);
    const renewed = await rentService.getRentSummary(facilityId, grn.id);
    const extTotal = renewed.extensions.reduce((s, e) => s + e.finalAmount, 0);
    expect(renewed.totalDue).toBe(3000 + extTotal);
  });

  it('reprices live when the Admin rate changes (no stored history)', async () => {
    const grn = await makeGrn(100);
    expect((await rentService.getRentSummary(facilityId, grn.id)).totalDue).toBe(3400);
    await CommodityModel.updateOne({ id: 'cmd-fs' }, { $set: { hamaliRate: 10 } });
    expect((await rentService.getRentSummary(facilityId, grn.id)).totalDue).toBe(4000);
  });

  it('allocates partial outward shares that never exceed the original amount', async () => {
    const grn = await makeGrn(100);
    const d1Date = new Date('2025-07-10');
    const rentOnly1 = await expectedRentOnly(grn.id, 30, d1Date);
    const { delivery: d1 } = await createDeliveryWithRetry(
      facilityId, { grnId: grn.id, date: d1Date, smallBags: 30, bigBags: 0, rentCharge: rentOnly1 }, userId,
    );
    expect('hamaliRate' in d1).toBe(false);
    expect('hamaliCharge' in d1).toBe(false);
    expect(d1.rentCharge).toBeCloseTo(rentOnly1 + 120, 2); // 30/100 of 400
    const d2Date = new Date('2025-07-20');
    const rentOnly2 = await expectedRentOnly(grn.id, 70, d2Date);
    const { delivery: d2 } = await createDeliveryWithRetry(
      facilityId, { grnId: grn.id, date: d2Date, smallBags: 70, bigBags: 0, rentCharge: rentOnly2 }, userId,
    );
    expect(d2.rentCharge).toBeCloseTo(rentOnly2 + 280, 2); // capped: 120 + 280 = 400
    const summary = await rentService.getRentSummary(facilityId, grn.id);
    expect(summary.totalDue).toBe(3000 + 400);
  });

  it('adds no hamali on merge or ownership transfer', async () => {
    const target = await makeGrn(100);
    const source = await makeGrn(50);
    const merged = await internalMovementService.mergeGrn(
      facilityId,
      { targetGrnId: target.id, sourceGrnIds: [source.id], movementDate: new Date('2025-07-10'), additionalRentAmount: 0, remarks: 'Merge carry test' },
      userId,
    );
    expect('hamaliAmount' in merged.targetGrn).toBe(false);
    expect('hamaliCharge' in merged.movement).toBe(false);
    expect('hamaliCarried' in merged.movement).toBe(false);
    expect(merged.targetGrn.bags).toBe(150);
    const transferred = await internalMovementService.transferOwnership(
      facilityId,
      {
        grnId: target.id, newCustomerId: customerB, movementDate: new Date('2025-07-11'),
        remarks: 'Transfer carry test', paymentDecision: 'SETTLE_NOW',
        settlementDetails: { amountPaid: merged.movement.financialSnapshot.remainingBalance || 0, paymentMode: 'Cash' },
      },
      userId,
    ).catch(async (err: unknown) => {
      if (err instanceof Error && err.message.includes('Outstanding rent')) {
        const match = err.message.match(/₹([\d,]+)/);
        const amount = match ? Number(match[1].replace(/,/g, '')) : 0;
        return internalMovementService.transferOwnership(
          facilityId,
          {
            grnId: target.id, newCustomerId: customerB, movementDate: new Date('2025-07-11'),
            remarks: 'Transfer carry test', paymentDecision: 'SETTLE_NOW',
            settlementDetails: { amountPaid: amount, paymentMode: 'Cash' },
          },
          userId,
        );
      }
      throw err;
    });
    expect('hamaliAmount' in transferred.grn).toBe(false);
    expect('hamaliCarried' in transferred.movement).toBe(false);
    expect(transferred.grn.customerId).toBe(customerB);
  });

  it('counts hamali once for zero-rent GRNs across partial deliveries (BUG-1)', async () => {
    const grn = await makeGrn(100, 0);
    const d1Date = new Date('2025-07-10');
    const rentOnly1 = await expectedRentOnly(grn.id, 30, d1Date);
    await createDeliveryWithRetry(
      facilityId, { grnId: grn.id, date: d1Date, smallBags: 30, bigBags: 0, rentCharge: rentOnly1 }, userId,
    );
    const afterFirst = await rentService.getRentSummary(facilityId, grn.id);
    // Base already embeds the first share: no full-share top-up (would double).
    expect(afterFirst.totalDue).toBeCloseTo(rentOnly1 + 120, 2);
    const d2Date = new Date('2025-07-20');
    const rentOnly2 = await expectedRentOnly(grn.id, 70, d2Date);
    await createDeliveryWithRetry(
      facilityId, { grnId: grn.id, date: d2Date, smallBags: 70, bigBags: 0, rentCharge: rentOnly2 }, userId,
    );
    const afterSecond = await rentService.getRentSummary(facilityId, grn.id);
    // Lifetime hamali across both deliveries equals the original 400 exactly.
    expect(afterSecond.totalDue).toBeCloseTo(rentOnly1 + rentOnly2 + 400, 2);
  });

  it('collects first-season hamali through rent payment to Settled (BUG-2)', async () => {
    const grn = await makeGrn(100);
    const before = await rentService.getRentSummary(facilityId, grn.id);
    expect(before.remainingBalance).toBe(3400);
    const result = await rentService.recordPayment(
      facilityId,
      { grnId: grn.id, amountPaid: 3400, paymentMode: 'Cash', paymentDate: new Date('2025-07-10') },
      userId,
    );
    expect(result.summary.remainingBalance).toBe(0);
    expect(result.summary.paymentStatus).toBe('Settled');
  });
});
