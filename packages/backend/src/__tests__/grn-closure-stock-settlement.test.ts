import mongoose from 'mongoose';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { connectToDatabase, disconnectDatabase } from '../database/connection.js';
import { CommodityModel } from '../database/models/commodity.model.js';
import { CommodityRateModel } from '../database/models/commodity-rate.model.js';
import { CustomerModel } from '../database/models/customer.model.js';
import { FacilityModel } from '../database/models/facility.model.js';
import { GrnModel } from '../database/models/grn.model.js';
import { InventoryTransactionModel } from '../database/models/inventory-transaction.model.js';
import { DeliveryChallanModel } from '../database/models/delivery-challan.model.js';
import { InternalMovementModel } from '../database/models/internal-movement.model.js';
import { createGrn } from '../modules/grn/handlers/create-grn.handler.js';
import { createDeliveryWithRetry } from '../modules/delivery/handlers/create-delivery.handler.js';
import { computeExpectedDeliveryRent } from '../modules/delivery/handlers/delivery-rent.helper.js';
import { deliveryService } from '../modules/delivery/delivery.service.js';
import { rentService } from '../modules/rent/rent.service.js';
import { internalMovementService } from '../modules/internal-movement/internal-movement.service.js';

describe('Phase 3: GRN Closure, Physical Stock & Financial Settlement Integrity', { timeout: 30000 }, () => {
  const facilityId = 'fac-closure-p3';
  const customerId = 'cust-closure-p3';
  const userId = 'usr-closure-p3';
  let seq = 0;

  beforeAll(async () => {
    process.env.ALLOW_HISTORICAL_TESTING_DATES = 'true';
    await connectToDatabase();
  });

  afterAll(async () => {
    delete process.env.ALLOW_HISTORICAL_TESTING_DATES;
    await disconnectDatabase();
  });

  beforeEach(async () => {
    await FacilityModel.deleteMany({});
    await CustomerModel.deleteMany({});
    await CommodityModel.deleteMany({});
    await CommodityRateModel.deleteMany({});
    await GrnModel.deleteMany({});
    await InventoryTransactionModel.deleteMany({});
    await DeliveryChallanModel.deleteMany({});
    await InternalMovementModel.deleteMany({});
    await mongoose.connection.collection('rentextensions').deleteMany({});
    await mongoose.connection.collection('rentpayments').deleteMany({});
    await FacilityModel.create({ id: facilityId, name: 'Closure Fac', code: 'CF', isActive: true });
    await CustomerModel.create({ id: customerId, name: 'Closure Farmer', facilityIds: [facilityId], isActive: true });
    await CommodityModel.create({
      id: 'cmd-closure', name: 'Closure Potato', normalizedName: 'closure potato',
      seasonDuration: 'Seasonal', isHamaliApplicable: true, hamaliRate: 4, isActive: true,
    });
  });

  async function makeGrn(bags = 100, opts: { rentType?: 'Seasonal' | 'Seasonal_3M' | 'Monthly'; inwardDate?: Date } = {}) {
    seq += 1;
    const rentType = opts.rentType ?? 'Seasonal';
    const date = opts.inwardDate ?? new Date('2025-06-15');
    const { grn } = await createGrn(
      facilityId,
      {
        grnNumber: `${6100 + seq}`, date, customerId, commodityId: 'cmd-closure',
        chamber: 'CH-1', bags, bagType: 'S', rentType,
        smallBagPrice: 30, bigBagPrice: 35, bagPrice: 30, rentAmount: bags * 30,
      },
      userId,
      { requireRates: false },
    );
    return grn;
  }

  async function expectedRentOnly(grnId: string, bags: number, deliveryDate: Date) {
    const session = await mongoose.startSession();
    try {
      const g = await GrnModel.findOne({ id: grnId }).lean().exec();
      const { expectedRentCharge } = await computeExpectedDeliveryRent({
        grn: {
          id: g!.id, date: g!.date, rentType: g!.rentType, commodityId: g!.commodityId,
          smallBagPrice: g!.smallBagPrice, bigBagPrice: g!.bigBagPrice, bagPrice: g!.bagPrice,
        },
        withdrawal: { smallBags: bags, bigBags: 0 },
        deliveryDate, session,
      });
      return expectedRentCharge;
    } finally {
      await session.endSession();
    }
  }

  it('Scenario 1: partial outward delivery keeps GRN OPEN with accurate stock balance', async () => {
    const grn = await makeGrn(100);
    const dDate = new Date('2025-07-10');
    const rent = await expectedRentOnly(grn.id, 40, dDate);
    const { delivery, summary } = await createDeliveryWithRetry(
      facilityId, { grnId: grn.id, date: dDate, smallBags: 40, bigBags: 0, rentCharge: rent }, userId,
    );
    expect(summary.remainingDeliveryBalance).toBe(60);
    expect(summary.grnStatus).toBe('OPEN');
    expect(delivery.smallBags).toBe(40);

    const doc = await GrnModel.findOne({ id: grn.id }).lean();
    expect(doc?.status).toBe('OPEN');
  });

  it('Scenario 2: final outward delivery with all dues paid transitions GRN to CLOSED', async () => {
    const grn = await makeGrn(100);
    // Settle full 3400 (3000 rent + 400 hamali)
    await rentService.recordPayment(facilityId, { grnId: grn.id, amountPaid: 3400, paymentMode: 'Cash', paymentDate: new Date('2025-07-01') }, userId);
    const dDate = new Date('2025-07-15');
    const rent = await expectedRentOnly(grn.id, 100, dDate);
    const { summary } = await createDeliveryWithRetry(
      facilityId, { grnId: grn.id, date: dDate, smallBags: 100, bigBags: 0, rentCharge: rent }, userId,
    );
    expect(summary.remainingDeliveryBalance).toBe(0);
    expect(summary.grnStatus).toBe('CLOSED');
    const doc = await GrnModel.findOne({ id: grn.id }).lean();
    expect(doc?.status).toBe('CLOSED');

    await expect(
      deliveryService.createDelivery(facilityId, { grnId: grn.id, smallBags: 1, bigBags: 0 }, userId),
    ).rejects.toThrow(/is CLOSED/);
  });

  it('Scenario 3: final outward delivery with rent or hamali outstanding keeps GRN OPEN', async () => {
    const grn = await makeGrn(100);
    // Pay rent only (3000), leaving ₹400 Hamali outstanding
    await rentService.recordPayment(facilityId, { grnId: grn.id, amountPaid: 3000, paymentMode: 'Cash', paymentDate: new Date('2025-07-01') }, userId);

    const dDate = new Date('2025-07-15');
    const rent = await expectedRentOnly(grn.id, 100, dDate);
    const { summary } = await createDeliveryWithRetry(
      facilityId, { grnId: grn.id, date: dDate, smallBags: 100, bigBags: 0, rentCharge: rent }, userId,
    );
    expect(summary.remainingDeliveryBalance).toBe(0);
    expect(summary.grnStatus).toBe('OPEN');

    const doc = await GrnModel.findOne({ id: grn.id }).lean();
    expect(doc?.status).toBe('OPEN');

    const rentSum = await rentService.getRentSummary(facilityId, grn.id);
    expect(rentSum.remainingBalance).toBe(400);
    expect(rentSum.paymentStatus).toBe('Not Settled');

    // Attempting further delivery fails due to zero stock, not closed status
    await expect(
      deliveryService.createDelivery(facilityId, { grnId: grn.id, smallBags: 1, bigBags: 0 }, userId),
    ).rejects.toThrow(/exceeds the available balance/);
  });

  it('Scenario 4: zero-stock GRN transitions to CLOSED upon settling outstanding rent', async () => {
    const grn = await makeGrn(100);
    await rentService.recordPayment(facilityId, { grnId: grn.id, amountPaid: 2000, paymentMode: 'Cash', paymentDate: new Date('2025-07-01') }, userId);
    const dDate = new Date('2025-07-15');
    const rent = await expectedRentOnly(grn.id, 100, dDate);
    await createDeliveryWithRetry(facilityId, { grnId: grn.id, date: dDate, smallBags: 100, bigBags: 0, rentCharge: rent }, userId);

    // Dues outstanding: 3400 - 2000 = 1400.
    const res = await rentService.recordPayment(facilityId, { grnId: grn.id, amountPaid: 1400, paymentMode: 'Cash', paymentDate: new Date('2025-07-16') }, userId);
    expect(res.summary.remainingBalance).toBe(0);
    expect(res.summary.paymentStatus).toBe('Settled');

    const doc = await GrnModel.findOne({ id: grn.id }).lean();
    expect(doc?.status).toBe('CLOSED');
  });

  it('Scenario 5: fully paid GRN with stock remaining stays OPEN', async () => {
    const grn = await makeGrn(100);
    await rentService.recordPayment(facilityId, { grnId: grn.id, amountPaid: 3400, paymentMode: 'Cash', paymentDate: new Date('2025-07-01') }, userId);
    const rentSum = await rentService.getRentSummary(facilityId, grn.id);
    expect(rentSum.remainingBalance).toBe(0);
    expect(rentSum.paymentStatus).toBe('Settled');

    const doc = await GrnModel.findOne({ id: grn.id }).lean();
    expect(doc?.status).toBe('OPEN');
  });

  it('Scenario 6: concurrent delivery requests prevent negative balance and duplicate drawdowns', async () => {
    const grn = await makeGrn(100);
    const dDate = new Date('2025-07-10');
    const rent = await expectedRentOnly(grn.id, 60, dDate);

    const [r1, r2] = await Promise.allSettled([
      deliveryService.createDelivery(facilityId, { grnId: grn.id, date: dDate, smallBags: 60, bigBags: 0, rentCharge: rent }, userId),
      deliveryService.createDelivery(facilityId, { grnId: grn.id, date: dDate, smallBags: 60, bigBags: 0, rentCharge: rent }, userId),
    ]);
    const fulfilled = [r1, r2].filter((r) => r.status === 'fulfilled');
    const rejected = [r1, r2].filter((r) => r.status === 'rejected');
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
  });

  it('Scenario 7: rejects merge or ownership transfer on depleted GRNs', async () => {
    const target = await makeGrn(100);
    const source = await makeGrn(50);
    const otherCust = await CustomerModel.create({ id: 'cust-other', name: 'Other Farmer', facilityIds: [facilityId], isActive: true });

    // Deliver all 100 bags of target, leaving rent unpaid so target remains OPEN
    const rent = await expectedRentOnly(target.id, 100, new Date('2025-07-10'));
    await createDeliveryWithRetry(facilityId, { grnId: target.id, date: new Date('2025-07-10'), smallBags: 100, bigBags: 0, rentCharge: rent }, userId);
    const targetDoc = await GrnModel.findOne({ id: target.id }).lean();
    expect(targetDoc?.status).toBe('OPEN');

    // Attempt merge into depleted target GRN is rejected
    await expect(
      internalMovementService.mergeGrn(facilityId, { targetGrnId: target.id, sourceGrnIds: [source.id], movementDate: new Date('2025-07-20'), remarks: 'Depleted merge test', additionalRentAmount: 0 }, userId),
    ).rejects.toThrow(/zero remaining stock/);

    // Attempt ownership transfer of depleted target GRN is rejected
    await expect(
      internalMovementService.transferOwnership(facilityId, { grnId: target.id, newCustomerId: otherCust.id, movementDate: new Date('2025-07-20'), remarks: 'Depleted transfer test', paymentDecision: 'SETTLE_NOW' }, userId),
    ).rejects.toThrow(/No stock remaining/);
  });

  it('Scenario 8: Seasonal_3M extra months outward accrual blocks premature closure', async () => {
    // Commodity with monthly rate 10
    await CommodityRateModel.create({
      id: 'cr-3m', facilityId, commodityId: 'cmd-closure', rentType: 'Monthly',
      bagType: 'S+B', smallRate: 10, bigRate: 12, effectiveFrom: new Date('2025-01-01'), isActive: true,
    });
    const grn = await makeGrn(100, { rentType: 'Seasonal_3M', inwardDate: new Date('2025-01-05') });
    // Inward rent = 3000, hamali = 400. Pay 3400.
    await rentService.recordPayment(facilityId, { grnId: grn.id, amountPaid: 3400, paymentMode: 'Cash', paymentDate: new Date('2025-01-10') }, userId);

    // Delivery after 5 months (2 extra months = 100 * 2 * 10 = 2000 extra rent)
    const dDate = new Date('2025-05-10');
    const { delivery, summary } = await createDeliveryWithRetry(
      facilityId, { grnId: grn.id, date: dDate, smallBags: 100, bigBags: 0 }, userId,
    );
    expect(delivery.rentCharge).toBeCloseTo(3000 + 2000 + 400, 2); // 5400 total
    expect(summary.remainingDeliveryBalance).toBe(0);
    // Dues outstanding: 2000 extra months. GRN MUST stay OPEN!
    expect(summary.grnStatus).toBe('OPEN');
    const doc = await GrnModel.findOne({ id: grn.id }).lean();
    expect(doc?.status).toBe('OPEN');

    const rentSum = await rentService.getRentSummary(facilityId, grn.id);
    expect(rentSum.remainingBalance).toBe(2000);

    // Settle the extra 2000
    await rentService.recordPayment(facilityId, { grnId: grn.id, amountPaid: 2000, paymentMode: 'Cash', paymentDate: new Date('2025-05-11') }, userId);
    const finalDoc = await GrnModel.findOne({ id: grn.id }).lean();
    expect(finalDoc?.status).toBe('CLOSED');
  });
});
