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
import { createGrn } from '../modules/grn/handlers/create-grn.handler.js';
import { createDeliveryWithRetry } from '../modules/delivery/handlers/create-delivery.handler.js';
import { computeExpectedDeliveryRent } from '../modules/delivery/handlers/delivery-rent.helper.js';
import { rentService } from '../modules/rent/rent.service.js';

describe('Hamali Snapshot Lifecycle & Historical Fallback Verification', () => {
  const facilityId = 'fac-hamali-snap';
  const customerId = 'cust-hamali-snap';
  const userId = 'usr-hamali-snap';
  let seq = 0;

  const originalEnv = process.env.ALLOW_HISTORICAL_TESTING_DATES;

  beforeAll(async () => {
    process.env.ALLOW_HISTORICAL_TESTING_DATES = 'true';
    await connectToDatabase();
  });

  afterAll(async () => {
    if (originalEnv !== undefined) {
      process.env.ALLOW_HISTORICAL_TESTING_DATES = originalEnv;
    } else {
      delete process.env.ALLOW_HISTORICAL_TESTING_DATES;
    }
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
    await mongoose.connection.collection('rentextensions').deleteMany({});
    await mongoose.connection.collection('rentpayments').deleteMany({});
    await FacilityModel.create({ id: facilityId, name: 'Snapshot Fac', code: 'SF', isActive: true });
    await CustomerModel.create({ id: customerId, name: 'Snap Farmer', facilityIds: [facilityId], isActive: true });
    await CommodityModel.create({
      id: 'cmd-snap', name: 'Snap Potato', normalizedName: 'snap potato',
      seasonDuration: 'Seasonal', isHamaliApplicable: true, hamaliRate: 4, isActive: true,
    });
  });

  async function makeGrn(bags = 100, commodityId = 'cmd-snap') {
    seq += 1;
    const { grn } = await createGrn(
      facilityId,
      {
        grnNumber: `${8100 + seq}`, date: new Date('2025-06-15'), customerId, commodityId,
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

  it('preserves snapshotted rate across subsequent commodity rate increases', async () => {
    const grn = await makeGrn(100);
    const persisted = await GrnModel.findOne({ id: grn.id }).lean().exec();
    expect(persisted?.hamaliRate).toBe(4);
    expect(persisted?.hamaliAmount).toBe(400);

    // Commodity rate changes from 4 to 12
    await CommodityModel.updateOne({ id: 'cmd-snap' }, { $set: { hamaliRate: 12 } });

    // Rent summary reflects original snapshot (not 4200)
    const summary = await rentService.getRentSummary(facilityId, grn.id);
    expect(summary.totalDue).toBe(3000 + 400);

    // Delivery 1: 40 bags @ ₹4 = ₹160
    const d1Date = new Date('2025-07-10');
    const rent1 = await expectedRentOnly(grn.id, 40, d1Date);
    const { delivery: d1 } = await createDeliveryWithRetry(
      facilityId, { grnId: grn.id, date: d1Date, smallBags: 40, bigBags: 0, rentCharge: rent1 }, userId,
    );
    expect(d1.rentCharge).toBeCloseTo(rent1 + 160, 2);

    // Delivery 2: 60 bags @ ₹4 = ₹240
    const d2Date = new Date('2025-07-20');
    const rent2 = await expectedRentOnly(grn.id, 60, d2Date);
    const { delivery: d2 } = await createDeliveryWithRetry(
      facilityId, { grnId: grn.id, date: d2Date, smallBags: 60, bigBags: 0, rentCharge: rent2 }, userId,
    );
    expect(d2.rentCharge).toBeCloseTo(rent2 + 240, 2);
    expect(((d1.rentCharge ?? 0) - rent1) + ((d2.rentCharge ?? 0) - rent2)).toBeCloseTo(400, 2);
  });

  it('preserves zero hamali obligation when commodity initially has hamali disabled', async () => {
    await CommodityModel.create({
      id: 'cmd-zero', name: 'Zero Potato', normalizedName: 'zero potato',
      seasonDuration: 'Seasonal', isHamaliApplicable: false, hamaliRate: 0, isActive: true,
    });
    const grn = await makeGrn(100, 'cmd-zero');
    const persisted = await GrnModel.findOne({ id: grn.id }).lean().exec();
    expect(persisted?.hamaliRate).toBe(0);
    expect(persisted?.hamaliAmount).toBe(0);

    await CommodityModel.updateOne({ id: 'cmd-zero' }, { $set: { isHamaliApplicable: true, hamaliRate: 5 } });
    const summary = await rentService.getRentSummary(facilityId, grn.id);
    expect(summary.totalDue).toBe(3000);

    const dDate = new Date('2025-07-10');
    const rent = await expectedRentOnly(grn.id, 50, dDate);
    const { delivery: d } = await createDeliveryWithRetry(
      facilityId, { grnId: grn.id, date: dDate, smallBags: 50, bigBags: 0, rentCharge: rent }, userId,
    );
    expect(d.rentCharge).toBeCloseTo(rent, 2);
  });

  it('flags legacy GRN without snapshot as PENDING_VERIFICATION when unpaid', async () => {
    seq += 1;
    const legacyId = `grn-legacy-${seq}`;
    await GrnModel.create({
      id: legacyId, facilityId, grnNumber: `${8100 + seq}`, inwardReceiptNumber: `IR-${8100 + seq}`,
      date: new Date('2025-05-10'), customerId, customerName: 'Snap Farmer',
      commodityId: 'cmd-snap', commodityName: 'Snap Potato', chamber: 'CH-1',
      bags: 100, bagType: 'S', smallBags: 100, bigBags: 0,
      rentType: 'Seasonal', rentAmount: 3000, bagPrice: 30, status: 'OPEN', createdBy: userId,
    });

    const summary = await rentService.getRentSummary(facilityId, legacyId);
    expect(summary.rentState).toBe('PENDING_VERIFICATION');
    expect(summary.verificationReason).toContain('no stored Hamali rate snapshot');
  });

  it('preserves settled payment history on legacy GRN without flagging for verification', async () => {
    seq += 1;
    const legacyId = `grn-legacy-paid-${seq}`;
    await GrnModel.create({
      id: legacyId, facilityId, grnNumber: `${8100 + seq}`, inwardReceiptNumber: `IR-${8100 + seq}`,
      date: new Date('2025-05-10'), customerId, customerName: 'Snap Farmer',
      commodityId: 'cmd-snap', commodityName: 'Snap Potato', chamber: 'CH-1',
      bags: 100, bagType: 'S', smallBags: 100, bigBags: 0,
      rentType: 'Seasonal', rentAmount: 3000, bagPrice: 30, status: 'OPEN', createdBy: userId,
    });
    await mongoose.connection.collection('rentpayments').insertOne({
      id: `pay-leg-${seq}`, facilityId, grnId: legacyId, grnNumber: `${8100 + seq}`,
      receiptNumber: `RCP-LEG-${seq}`, amountPaid: 3400, paymentMode: 'Cash',
      paymentDate: new Date('2025-06-01'), notes: 'Legacy full payment', createdBy: userId,
    });

    const summary = await rentService.getRentSummary(facilityId, legacyId);
    expect(summary.rentState).toBe('SETTLED');
    expect(summary.remainingBalance).toBe(0);
    expect(summary.verificationReason).toBeNull();
  });

  it('cumulative partial deliveries never exceed original obligation across three parts', async () => {
    const grn = await makeGrn(100);
    const d1Date = new Date('2025-07-01'), d2Date = new Date('2025-07-10'), d3Date = new Date('2025-07-20');
    const r1 = await expectedRentOnly(grn.id, 33, d1Date);
    const { delivery: del1 } = await createDeliveryWithRetry(
      facilityId, { grnId: grn.id, date: d1Date, smallBags: 33, bigBags: 0, rentCharge: r1 }, userId,
    );
    const r2 = await expectedRentOnly(grn.id, 33, d2Date);
    const { delivery: del2 } = await createDeliveryWithRetry(
      facilityId, { grnId: grn.id, date: d2Date, smallBags: 33, bigBags: 0, rentCharge: r2 }, userId,
    );
    const r3 = await expectedRentOnly(grn.id, 34, d3Date);
    const { delivery: del3 } = await createDeliveryWithRetry(
      facilityId, { grnId: grn.id, date: d3Date, smallBags: 34, bigBags: 0, rentCharge: r3 }, userId,
    );

    const h1 = (del1.rentCharge ?? 0) - r1, h2 = (del2.rentCharge ?? 0) - r2, h3 = (del3.rentCharge ?? 0) - r3;
    expect(h1).toBeCloseTo(132, 2);
    expect(h2).toBeCloseTo(132, 2);
    expect(h3).toBeCloseTo(136, 2);
    expect(h1 + h2 + h3).toBeCloseTo(400, 2);
  });

  it('repeat requests produce deterministic calculations without drift', async () => {
    const grn = await makeGrn(100);
    const s1 = await rentService.getRentSummary(facilityId, grn.id);
    const s2 = await rentService.getRentSummary(facilityId, grn.id);
    expect(s1.totalDue).toBe(s2.totalDue);
    expect(s1.remainingBalance).toBe(s2.remainingBalance);
  });
});
