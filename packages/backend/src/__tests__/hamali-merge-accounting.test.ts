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

describe('Hamali Merge Accounting (Unpaid, Partially Paid, Fully Paid)', () => {
  const facilityId = 'fac-hamali-merge';
  const customerId = 'cust-hamali-merge';
  const userId = 'usr-hamali-merge';
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
    await InternalMovementModel.deleteMany({});
    await DeliveryChallanModel.deleteMany({});
    await mongoose.connection.collection('rentextensions').deleteMany({});
    await mongoose.connection.collection('rentpayments').deleteMany({});
    await FacilityModel.create({ id: facilityId, name: 'Merge Fac', code: 'MF', isActive: true });
    await CustomerModel.create({ id: customerId, name: 'Merge Farmer', facilityIds: [facilityId], isActive: true });
    await CommodityModel.create({
      id: 'cmd-merge', name: 'Merge Potato', normalizedName: 'merge potato',
      seasonDuration: 'Seasonal', isHamaliApplicable: true, hamaliRate: 4, isActive: true,
    });
  });

  async function makeGrn(bags: number, inwardDate = new Date('2025-06-15')) {
    seq += 1;
    const { grn } = await createGrn(
      facilityId,
      {
        grnNumber: `${7100 + seq}`, date: inwardDate, customerId, commodityId: 'cmd-merge',
        chamber: 'CH-1', bags, bagType: 'S', rentType: 'Seasonal',
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

  async function recordPayment(grnId: string, grnNumber: string, amount: number) {
    seq += 1;
    await mongoose.connection.collection('rentpayments').insertOne({
      id: `pay-mrg-${seq}`, facilityId, grnId, grnNumber,
      receiptNumber: `RCP-MRG-${seq}`, amountPaid: amount, paymentMode: 'Cash',
      paymentDate: new Date('2025-07-01'), notes: 'Pre-merge payment', createdBy: userId,
    });
  }

  it('source Hamali fully unpaid carries entire liability into target without duplicate on delivery', async () => {
    const target = await makeGrn(100);
    const source = await makeGrn(50);
    const merged = await internalMovementService.mergeGrn(
      facilityId,
      { targetGrnId: target.id, sourceGrnIds: [source.id], movementDate: new Date('2025-07-10'), additionalRentAmount: 0, remarks: 'Unpaid merge' },
      userId,
    );
    expect(merged.targetGrn.bags).toBe(150);

    // Carried: 1500 rent + 200 hamali = 1700. Target total: 3000 rent + 1700 carried + 400 target hamali = 5100.
    const summary = await rentService.getRentSummary(facilityId, target.id);
    expect(summary.totalDue).toBe(5100);

    // Delivery 1 (100 bags): Hamali share = 400
    const d1Date = new Date('2025-07-15');
    const r1 = await expectedRentOnly(target.id, 100, d1Date);
    const { delivery: del1 } = await createDeliveryWithRetry(
      facilityId, { grnId: target.id, date: d1Date, smallBags: 100, bigBags: 0, rentCharge: r1 }, userId,
    );
    expect(del1.rentCharge).toBeCloseTo(r1 + 400, 2);

    // Delivery 2 (50 merged bags): Hamali share = 0 (no duplicate)
    const d2Date = new Date('2025-07-25');
    const r2 = await expectedRentOnly(target.id, 50, d2Date);
    const { delivery: del2 } = await createDeliveryWithRetry(
      facilityId, { grnId: target.id, date: d2Date, smallBags: 50, bigBags: 0, rentCharge: r2 }, userId,
    );
    expect(del2.rentCharge).toBeCloseTo(r2, 2);
  });

  it('source Hamali partially paid carries exact remaining balance into target', async () => {
    const target = await makeGrn(100);
    const source = await makeGrn(50);
    await recordPayment(source.id, source.grnNumber, 500);

    const merged = await internalMovementService.mergeGrn(
      facilityId,
      { targetGrnId: target.id, sourceGrnIds: [source.id], movementDate: new Date('2025-07-10'), additionalRentAmount: 0, remarks: 'Partial paid merge' },
      userId,
    );
    // Source: 1700 due - 500 paid = 1200 balance carried. Target total: 3000 + 1200 + 400 = 4600.
    expect(merged.movement.financialSnapshot.rentAmount).toBe(4200); // 3000 base + 1200 carried
    const summary = await rentService.getRentSummary(facilityId, target.id);
    expect(summary.totalDue).toBe(4600); // 4200 + 400 target hamali
    expect(summary.remainingBalance).toBe(4600);
  });

  it('source Hamali fully paid carries zero rent and does not recharge Hamali on target delivery', async () => {
    const target = await makeGrn(100);
    const source = await makeGrn(50);
    await recordPayment(source.id, source.grnNumber, 1700);

    const merged = await internalMovementService.mergeGrn(
      facilityId,
      { targetGrnId: target.id, sourceGrnIds: [source.id], movementDate: new Date('2025-07-10'), additionalRentAmount: 0, remarks: 'Fully paid merge' },
      userId,
    );
    expect(merged.movement.financialSnapshot.rentAmount).toBe(3000); // 0 carried
    const summary = await rentService.getRentSummary(facilityId, target.id);
    expect(summary.totalDue).toBe(3400); // 3000 rent + 400 target hamali

    const dDate = new Date('2025-07-20');
    const r = await expectedRentOnly(target.id, 150, dDate);
    const { delivery: del } = await createDeliveryWithRetry(
      facilityId, { grnId: target.id, date: dDate, smallBags: 150, bigBags: 0, rentCharge: r }, userId,
    );
    expect(del.rentCharge).toBeCloseTo(r + 400, 2); // exactly target's 400 hamali, 0 for source
  });

  it('target GRN with Hamali fully settled before merge only carries source obligation', async () => {
    const target = await makeGrn(100);
    await recordPayment(target.id, target.grnNumber, 3400); // Target fully settled

    const source = await makeGrn(50);
    await internalMovementService.mergeGrn(
      facilityId,
      { targetGrnId: target.id, sourceGrnIds: [source.id], movementDate: new Date('2025-07-10'), additionalRentAmount: 0, remarks: 'Target settled merge' },
      userId,
    );

    const summary = await rentService.getRentSummary(facilityId, target.id);
    // Target was 3400 settled. Carried from source = 1700. Remaining balance = 1700.
    expect(summary.totalPaid).toBe(3400);
    expect(summary.totalDue).toBe(5100);
    expect(summary.remainingBalance).toBe(1700);
  });
});
