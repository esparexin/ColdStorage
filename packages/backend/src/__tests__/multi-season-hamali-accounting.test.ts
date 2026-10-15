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
import { rentExtensionService } from '../modules/rent/rent-extension.service.js';

describe('Multi-Season Hamali Accounting (PR 2)', () => {
  const facilityId = 'fac-msha';
  const customerId = 'cust-msha';
  const userId = 'usr-msha';
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
    await DeliveryChallanModel.deleteMany({});
    await mongoose.connection.collection('rentextensions').deleteMany({});
    await mongoose.connection.collection('rentpayments').deleteMany({});

    await FacilityModel.create({ id: facilityId, name: 'MSHA Facility', code: 'MSHA', isActive: true });
    await CustomerModel.create({ id: customerId, name: 'MSHA Farmer', facilityIds: [facilityId], isActive: true });
    await CommodityModel.create({
      id: 'cmd-msha-potato', name: 'MSHA Potato', normalizedName: 'msha potato',
      seasonDuration: 'Seasonal', isHamaliApplicable: true, hamaliRate: 4, isActive: true,
    });
  });

  async function makeGrn(bags = 100, bagPrice = 30) {
    seq += 1;
    const { grn } = await createGrn(
      facilityId,
      {
        grnNumber: `${9500 + seq}`, date: new Date('2025-06-15'), customerId, commodityId: 'cmd-msha-potato',
        chamber: 'CH-1', bags, bagType: 'S', rentType: 'Seasonal',
        bagPrice, rentAmount: bags * bagPrice,
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

  it('preserves inward hamali across Season 1, Jan/Feb extensions, and Season 2 renewal without new charges', async () => {
    // 100 bags @ ₹30 storage rent = 3000, inward hamali @ ₹4 = 400.
    const grn = await makeGrn(100, 30);
    const initialSummary = await rentService.getRentSummary(facilityId, grn.id);
    expect(initialSummary.totalDue).toBe(3400); // 3000 rent + 400 inward hamali

    // Finalize Jan 2026 extension (100 bags × ₹30 = 3000)
    await rentExtensionService.finalizeExtension(facilityId, { grnId: grn.id, seasonYear: 2025, period: 'JANUARY' }, userId);
    const janSummary = await rentService.getRentSummary(facilityId, grn.id);
    const janExt = janSummary.extensions.find((e) => e.period === 'JANUARY')!.finalAmount;
    expect(janSummary.totalDue).toBe(3000 + janExt + 400);

    // Finalize Feb 2026 extension
    await rentExtensionService.finalizeExtension(facilityId, { grnId: grn.id, seasonYear: 2025, period: 'FEBRUARY' }, userId);
    const febSummary = await rentService.getRentSummary(facilityId, grn.id);
    const febExtTotal = febSummary.extensions.reduce((s, e) => s + e.finalAmount, 0);
    expect(febSummary.totalDue).toBe(3000 + febExtTotal + 400);

    // Finalize Season 2 (2026) renewal
    await rentExtensionService.finalizeExtension(facilityId, { grnId: grn.id, seasonYear: 2026, period: 'SEASON' }, userId);
    const renewedSummary = await rentService.getRentSummary(facilityId, grn.id);
    const allExtTotal = renewedSummary.extensions.reduce((s, e) => s + e.finalAmount, 0);

    // Original inward hamali (₹400) remains preserved; no new hamali charge was added
    expect(renewedSummary.totalDue).toBe(3000 + allExtTotal + 400);
    expect(renewedSummary.remainingBalance).toBe(3000 + allExtTotal + 400);
  }, 30000);

  it('recovers uncollected hamali share pro-rata across partial outward deliveries spanning Season 1 and Season 2', async () => {
    // 100 bags, ₹400 inward hamali
    const grn = await makeGrn(100, 30);

    // Delivery 1 in Season 1: 30 bags withdrawn
    const d1Date = new Date('2025-08-10');
    const rentOnly1 = await expectedRentOnly(grn.id, 30, d1Date);
    const { delivery: d1 } = await createDeliveryWithRetry(
      facilityId, { grnId: grn.id, date: d1Date, smallBags: 30, bigBags: 0, rentCharge: rentOnly1, gpNumber: 'GP-9501' }, userId,
    );
    // 30 / 100 of 400 = 120 hamali allocated
    expect(d1.rentCharge).toBeCloseTo(rentOnly1 + 120, 2);

    // Transition lot into Season 2 via SEASON renewal
    await rentExtensionService.finalizeExtension(facilityId, { grnId: grn.id, seasonYear: 2026, period: 'SEASON' }, userId);

    // Delivery 2 in Season 2: 40 bags withdrawn
    const d2Date = new Date('2026-05-15');
    const rentOnly2 = await expectedRentOnly(grn.id, 40, d2Date);
    const { delivery: d2 } = await createDeliveryWithRetry(
      facilityId, { grnId: grn.id, date: d2Date, smallBags: 40, bigBags: 0, rentCharge: rentOnly2, gpNumber: 'GP-9502' }, userId,
    );
    // 40 / 100 of 400 = 160 hamali allocated
    expect(d2.rentCharge).toBeCloseTo(rentOnly2 + 160, 2);

    // Delivery 3 in Season 2: remaining 30 bags withdrawn
    const d3Date = new Date('2026-06-20');
    const rentOnly3 = await expectedRentOnly(grn.id, 30, d3Date);
    const { delivery: d3 } = await createDeliveryWithRetry(
      facilityId, { grnId: grn.id, date: d3Date, smallBags: 30, bigBags: 0, rentCharge: rentOnly3, gpNumber: 'GP-9503' }, userId,
    );
    // 30 / 100 of 400 = 120 hamali allocated (prior: 120 + 160 = 280, cap: 400 - 280 = 120)
    expect(d3.rentCharge).toBeCloseTo(rentOnly3 + 120, 2);

    // Total inward hamali allocated across all three deliveries across seasons: exactly 400
    const totalHamaliAllocated = (d1.rentCharge! - rentOnly1) + (d2.rentCharge! - rentOnly2) + (d3.rentCharge! - rentOnly3);
    expect(totalHamaliAllocated).toBeCloseTo(400, 2);
  }, 30000);

  it('supports multi-season lot with pre-settled hamali and final balance payment', async () => {
    // Inward: 100 bags @ ₹30 = 3000 rent + 400 hamali = 3400 total
    const grn = await makeGrn(100, 30);

    // Customer settles initial bill in Season 1 via rent payment
    const pay1 = await rentService.recordPayment(
      facilityId,
      { grnId: grn.id, amountPaid: 3400, paymentMode: 'Cash', paymentDate: new Date('2025-07-01') },
      userId,
    );
    expect(pay1.summary.remainingBalance).toBe(0);
    expect(pay1.summary.paymentStatus).toBe('Settled');

    // Lot stays in storage into Season 2 renewal
    await rentExtensionService.finalizeExtension(facilityId, { grnId: grn.id, seasonYear: 2026, period: 'SEASON' }, userId);
    const s2Summary = await rentService.getRentSummary(facilityId, grn.id);
    const s2Ext = s2Summary.extensions.find((e) => e.period === 'SEASON')!.finalAmount;

    // Total due: 3400 (S1 rent+hamali) + s2Ext. Remaining balance is just s2Ext (hamali not billed again)
    expect(s2Summary.totalDue).toBe(3400 + s2Ext);
    expect(s2Summary.totalPaid).toBe(3400);
    expect(s2Summary.remainingBalance).toBe(s2Ext);

    // Transferee / owner clears Season 2 balance
    const pay2 = await rentService.recordPayment(
      facilityId,
      { grnId: grn.id, amountPaid: s2Ext, paymentMode: 'UPI', paymentDate: new Date('2026-04-01') },
      userId,
    );
    expect(pay2.summary.remainingBalance).toBe(0);
    expect(pay2.summary.paymentStatus).toBe('Settled');
  });

  it('charges zero hamali across multi-season lifecycle when commodity disables hamali', async () => {
    await CommodityModel.create({
      id: 'cmd-msha-wheat', name: 'MSHA Wheat', normalizedName: 'msha wheat',
      seasonDuration: 'Seasonal', isHamaliApplicable: false, hamaliRate: 0, isActive: true,
    });

    const { grn } = await createGrn(
      facilityId,
      {
        grnNumber: `${9600 + (++seq)}`, date: new Date('2025-06-15'), customerId, commodityId: 'cmd-msha-wheat',
        chamber: 'CH-1', bags: 100, bagType: 'S', rentType: 'Seasonal',
        bagPrice: 20, rentAmount: 2000,
      },
      userId,
      { requireRates: false },
    );

    const s1 = await rentService.getRentSummary(facilityId, grn.id);
    expect(s1.totalDue).toBe(2000); // 0 hamali

    await rentExtensionService.finalizeExtension(facilityId, { grnId: grn.id, seasonYear: 2026, period: 'SEASON' }, userId);
    const s2 = await rentService.getRentSummary(facilityId, grn.id);
    const ext = s2.extensions.reduce((s, e) => s + e.finalAmount, 0);
    expect(s2.totalDue).toBe(2000 + ext); // 0 hamali preserved
  });
});
