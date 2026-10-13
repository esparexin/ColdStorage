import mongoose from 'mongoose';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { connectToDatabase, disconnectDatabase } from '../database/connection.js';
import { CommodityModel } from '../database/models/commodity.model.js';
import { CommodityRateModel } from '../database/models/commodity-rate.model.js';
import { CustomerModel } from '../database/models/customer.model.js';
import { DeliveryChallanModel } from '../database/models/delivery-challan.model.js';
import { FacilityModel } from '../database/models/facility.model.js';
import { GrnModel } from '../database/models/grn.model.js';
import { InventoryTransactionModel } from '../database/models/inventory-transaction.model.js';
import { createGrn } from '../modules/grn/handlers/create-grn.handler.js';
import { createDeliveryWithRetry } from '../modules/delivery/handlers/create-delivery.handler.js';
import { computeExpectedDeliveryRent } from '../modules/delivery/handlers/delivery-rent.helper.js';
import { rentExtensionService } from '../modules/rent/rent-extension.service.js';

/**
 * Outward rent-vs-Hamali gate (F2): while a first-season Hamali share applies,
 * the effective per-bag rent must exceed the Hamali rate. Post-renewal
 * deliveries (share 0) skip the gate entirely.
 */
describe('Outward rent-vs-Hamali gate (F2)', () => {
  const facilityId = 'fac-rent-hamali-gate';
  const customerId = 'cust-rent-hamali-gate';
  const userId = 'usr-rent-hamali-gate';
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

  async function reset() {
    await FacilityModel.deleteMany({});
    await CustomerModel.deleteMany({});
    await CommodityModel.deleteMany({});
    await CommodityRateModel.deleteMany({});
    await GrnModel.deleteMany({});
    await InventoryTransactionModel.deleteMany({});
    await DeliveryChallanModel.deleteMany({});
    await mongoose.connection.collection('rentextensions').deleteMany({});
    await mongoose.connection.collection('rentpayments').deleteMany({});
    await FacilityModel.create({ id: facilityId, name: 'Gate Facility', code: 'GATE', isActive: true });
    await CustomerModel.create({ id: customerId, name: 'Gate Farmer', facilityIds: [facilityId], isActive: true });
    await CommodityModel.create({
      id: 'cmd-gate', name: 'Gate Potato', normalizedName: 'gate potato',
      seasonDuration: 'Seasonal', isHamaliApplicable: true, hamaliRate: 4, isActive: true,
    });
  }

  async function makeGrn(bagPrice: number) {
    seq += 1;
    const { grn } = await createGrn(
      facilityId,
      {
        grnNumber: `${9100 + seq}`, date: new Date('2025-06-15'), customerId, commodityId: 'cmd-gate',
        chamber: 'CH-1', bags: 100, bagType: 'S', rentType: 'Seasonal',
        bagPrice, rentAmount: 100 * bagPrice,
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

  it.each([[3, 30], [4, 40]] as const)(
    'rejects first-season delivery at/below Hamali (bagPrice %i)',
    async (bagPrice, expected) => {
      await reset();
      const grn = await makeGrn(bagPrice);
      const dDate = new Date('2025-07-10');
      expect(await expectedRentOnly(grn.id, 10, dDate)).toBe(expected);
      await expect(attemptDeliveryAfterReset(grn.id, dDate, expected)).rejects.toThrow(
        'must exceed the Hamali rate of ₹4/bag',
      );
    },
  );

  async function attemptDeliveryAfterReset(grnId: string, dDate: Date, rentOnly: number) {
    return createDeliveryWithRetry(
      facilityId, { grnId, date: dDate, smallBags: 10, bigBags: 0, rentCharge: rentOnly }, userId,
    );
  }

  it('skips the gate post-renewal when no Hamali share applies', async () => {
    await reset();
    const grn = await makeGrn(3);
    await rentExtensionService.finalizeExtension(facilityId, { grnId: grn.id, seasonYear: 2026, period: 'SEASON' }, userId);
    const dDate = new Date('2026-04-10');
    const rentOnly = await expectedRentOnly(grn.id, 10, dDate);
    const { delivery } = await createDeliveryWithRetry(
      facilityId, { grnId: grn.id, date: dDate, smallBags: 10, bigBags: 0, rentCharge: rentOnly }, userId,
    );
    expect(delivery.rentCharge).toBe(rentOnly);
  });

  it('accepts first-season delivery above the Hamali rate', async () => {
    await reset();
    const grn = await makeGrn(30);
    const dDate = new Date('2025-07-10');
    const rentOnly = await expectedRentOnly(grn.id, 10, dDate);
    const { delivery } = await createDeliveryWithRetry(
      facilityId, { grnId: grn.id, date: dDate, smallBags: 10, bigBags: 0, rentCharge: rentOnly }, userId,
    );
    expect(delivery.rentCharge).toBe(rentOnly + 40);
  });
});
