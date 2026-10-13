import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
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

/**
 * Phase 2 — Outward hamali settlement (feat/hamali-accounting-integrity).
 * Outstanding hamali for delivered bags is settled through the existing
 * outward transaction; the same handling is never charged twice and
 * GRN.hamaliAmount stays frozen as the inward obligation.
 */
describe('Outward hamali settlement', () => {
  const facilityId = 'fac-hamali-out';
  const customerId = 'cust-hamali-out';
  const userId = 'usr-hamali-out';
  const originalEnv = process.env.ALLOW_HISTORICAL_TESTING_DATES;

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
    await DeliveryChallanModel.deleteMany({});
    await InventoryTransactionModel.deleteMany({});
    await FacilityModel.create({ id: facilityId, name: 'Outward Facility', code: 'OUT', isActive: true });
    await CustomerModel.create({ id: customerId, name: 'Outward Farmer', facilityIds: [facilityId], isActive: true });
    await CommodityModel.create({
      id: 'cmd-out', name: 'Outward Potato', normalizedName: 'outward potato',
      seasonDuration: 'Seasonal', isHamaliApplicable: true, hamaliRate: 4, isActive: true,
    });
    await CommodityRateModel.create({
      id: 'crt-out-s', commodityId: 'cmd-out', rentType: 'Seasonal',
      smallRate: 30, bigRate: 35, hamaliRate: 999, isActive: true,
    });
    await CommodityRateModel.create({
      id: 'crt-out-m', commodityId: 'cmd-out', rentType: 'Monthly',
      smallRate: 10, bigRate: 12, hamaliRate: 999, isActive: true,
    });
  });

  async function seedGrn(bags = 100, rate: number | undefined = undefined) {
    const { grn } = await createGrn(
      facilityId,
      {
        grnNumber: `${Math.floor(1000 + Math.random() * 9000)}`,
        date: new Date('2026-01-05'), customerId, commodityId: 'cmd-out',
        chamber: 'CH-1', bags, bagType: 'S/B', rentType: 'Seasonal',
        smallBagPrice: 30, bigBagPrice: 35, rentAmount: bags * 30,
        ...(rate !== undefined ? { hamaliRate: rate } : {}),
      },
      userId,
      { requireRates: false },
    );
    return grn;
  }

  it('records hamali for full outward delivery without mutating GRN obligation', async () => {
    const grn = await seedGrn(100);
    expect(grn.hamaliAmount).toBe(400);
    const { delivery } = await createDeliveryWithRetry(
      facilityId, { grnId: grn.id, smallBags: 60, bigBags: 40 }, userId,
    );
    expect(delivery.hamaliRate).toBe(4);
    expect(delivery.hamaliCharge).toBe(400);
    const persisted = await GrnModel.findOne({ id: grn.id }).lean().exec();
    expect(persisted?.hamaliAmount).toBe(400);
    const challan = await DeliveryChallanModel.findOne({ id: delivery.id }).lean().exec();
    expect(challan?.hamaliRate).toBe(4);
    expect(challan?.hamaliCharge).toBe(400);
  });

  it('settles partial outward deliveries that reconcile to the inward total', async () => {
    const grn = await seedGrn(100);
    const first = await createDeliveryWithRetry(facilityId, { grnId: grn.id, smallBags: 30, bigBags: 0 }, userId);
    expect(first.delivery.hamaliCharge).toBe(120);
    const second = await createDeliveryWithRetry(facilityId, { grnId: grn.id, smallBags: 30, bigBags: 40 }, userId);
    expect(second.delivery.hamaliCharge).toBe(280);
    expect((first.delivery.hamaliCharge ?? 0) + (second.delivery.hamaliCharge ?? 0)).toBe(400);
    const persisted = await GrnModel.findOne({ id: grn.id }).lean().exec();
    expect(persisted?.hamaliAmount).toBe(400);
  });

  it('settles zero hamali when GRN rate is zero and ignores Controller rate', async () => {
    const grn = await seedGrn(50, 0);
    expect(grn.hamaliRate).toBe(0);
    const { delivery } = await createDeliveryWithRetry(
      facilityId, { grnId: grn.id, smallBags: 50, bigBags: 0 }, userId,
    );
    expect(delivery.hamaliRate).toBe(0);
    expect(delivery.hamaliCharge).toBe(0);
  });

  it('uses historical GRN rate after commodity rate changes', async () => {
    const grn = await seedGrn(100);
    await CommodityModel.updateOne({ id: 'cmd-out' }, { $set: { hamaliRate: 10 } });
    const { delivery } = await createDeliveryWithRetry(
      facilityId, { grnId: grn.id, smallBags: 25, bigBags: 0 }, userId,
    );
    expect(delivery.hamaliRate).toBe(4);
    expect(delivery.hamaliCharge).toBe(100);
  });

  it('rejects mismatched client hamaliCharge like rentCharge reconciliation', async () => {
    const grn = await seedGrn(100);
    await expect(
      createDeliveryWithRetry(facilityId, { grnId: grn.id, smallBags: 10, bigBags: 0, hamaliCharge: 9999 }, userId),
    ).rejects.toThrow(/hamaliCharge mismatch/);
  });
});
