import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { connectToDatabase, disconnectDatabase } from '../database/connection.js';
import { CommodityModel } from '../database/models/commodity.model.js';
import { CommodityRateModel } from '../database/models/commodity-rate.model.js';
import { CustomerModel } from '../database/models/customer.model.js';
import { FacilityModel } from '../database/models/facility.model.js';
import { GrnModel } from '../database/models/grn.model.js';
import { createGrn } from '../modules/grn/handlers/create-grn.handler.js';
import { resolveEffectiveHamaliRate } from '../modules/common/hamali-resolution.js';
import { calculateHamaliAmount } from '@cold-storage/contracts';

/**
 * Phase 1 — Hamali SSOT regression (feat/hamali-accounting-integrity).
 * Locks the approved rate-resolution rule:
 * input override ?? commodity master; Controller ignored; disabled => 0;
 * history preserved; one-time (never x months).
 */
describe('Hamali SSOT — rate resolution & regression', () => {
  const facilityId = 'fac-hamali-ssot';
  const customerId = 'cust-hamali-ssot';
  const userId = 'usr-hamali-ssot';
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
    await FacilityModel.create({ id: facilityId, name: 'SSOT Facility', code: 'SSOT', isActive: true });
    await CustomerModel.create({ id: customerId, name: 'SSOT Farmer', facilityIds: [facilityId], isActive: true });
  });

  async function seedCommodity(opts: { rate: number; applicable?: boolean; controllerHamali?: number }) {
    const commodityId = `cmd-ssot-${Math.random().toString(36).slice(2, 8)}`;
    await CommodityModel.create({
      id: commodityId,
      name: `SSOT ${commodityId}`,
      normalizedName: commodityId.toLowerCase(),
      seasonDuration: 'Seasonal',
      isHamaliApplicable: opts.applicable ?? true,
      hamaliRate: opts.rate,
      isActive: true,
    });
    await CommodityRateModel.create({
      id: `crt-${commodityId}-s`,
      commodityId,
      rentType: 'Seasonal',
      smallRate: 30,
      bigRate: 35,
      hamaliRate: opts.controllerHamali ?? 999,
      isActive: true,
    });
    await CommodityRateModel.create({
      id: `crt-${commodityId}-m`,
      commodityId,
      rentType: 'Monthly',
      smallRate: 10,
      bigRate: 12,
      hamaliRate: opts.controllerHamali ?? 999,
      isActive: true,
    });
    return commodityId;
  }

  it('ignores Price Controller hamaliRate and uses commodity master', async () => {
    const commodityId = await seedCommodity({ rate: 4, controllerHamali: 999 });
    const { grn } = await createGrn(
      facilityId,
      {
        grnNumber: '6001', date: new Date('2026-01-05'), customerId, commodityId,
        chamber: 'CH-1', bags: 100, bagType: 'S/B', rentType: 'Seasonal', bagPrice: 30, rentAmount: 3000,
      },
      userId,
    );
    expect(grn.hamaliRate).toBe(4);
    expect(grn.hamaliAmount).toBe(400);
  });

  it('resolves disabled commodity to 0 even with conflicting Controller rate', async () => {
    const commodityId = await seedCommodity({ rate: 0, applicable: false, controllerHamali: 777 });
    await CommodityModel.updateOne({ id: commodityId }, { $set: { isHamaliApplicable: false, hamaliRate: 0 } });
    const { grn } = await createGrn(
      facilityId,
      {
        grnNumber: '6002', date: new Date('2026-01-05'), customerId, commodityId,
        chamber: 'CH-1', bags: 50, bagType: 'S/B', rentType: 'Seasonal', bagPrice: 30, rentAmount: 1500,
      },
      userId,
    );
    expect(grn.hamaliRate).toBe(0);
    expect(grn.hamaliAmount).toBe(0);
  });

  it('honors API-only input.hamaliRate override over commodity master', async () => {
    const commodityId = await seedCommodity({ rate: 4, controllerHamali: 999 });
    const { grn } = await createGrn(
      facilityId,
      {
        grnNumber: '6003', date: new Date('2026-01-05'), customerId, commodityId,
        chamber: 'CH-1', bags: 10, bagType: 'S/B', rentType: 'Seasonal', bagPrice: 30, rentAmount: 300, hamaliRate: 6,
      },
      userId,
    );
    expect(grn.hamaliRate).toBe(6);
    expect(grn.hamaliAmount).toBe(60);
  });

  it('preserves historical GRN amounts when commodity rate changes', async () => {
    const commodityId = await seedCommodity({ rate: 4, controllerHamali: 0 });
    const first = await createGrn(
      facilityId,
      {
        grnNumber: '6004', date: new Date('2026-01-05'), customerId, commodityId,
        chamber: 'CH-1', bags: 100, bagType: 'S/B', rentType: 'Seasonal', bagPrice: 30, rentAmount: 3000,
      },
      userId,
    );
    expect(first.grn.hamaliAmount).toBe(400);
    await CommodityModel.updateOne({ id: commodityId }, { $set: { hamaliRate: 10 } });
    const persisted = await GrnModel.findOne({ id: first.grn.id }).lean().exec();
    expect(persisted?.hamaliRate).toBe(4);
    expect(persisted?.hamaliAmount).toBe(400);
    const second = await createGrn(
      facilityId,
      {
        grnNumber: '6005', date: new Date('2026-01-06'), customerId, commodityId,
        chamber: 'CH-1', bags: 100, bagType: 'S/B', rentType: 'Seasonal', bagPrice: 30, rentAmount: 3000,
      },
      userId,
    );
    expect(second.grn.hamaliRate).toBe(10);
    expect(second.grn.hamaliAmount).toBe(1000);
  });

  it('charges one-time per bag regardless of rent type or months', () => {
    expect(calculateHamaliAmount(100, 4)).toBe(400);
    expect(resolveEffectiveHamaliRate(undefined, { isHamaliApplicable: true, hamaliRate: 4 })).toBe(4);
    expect(resolveEffectiveHamaliRate(6, { isHamaliApplicable: true, hamaliRate: 4 })).toBe(6);
    expect(resolveEffectiveHamaliRate(undefined, { isHamaliApplicable: false, hamaliRate: 5 })).toBe(0);
    expect(resolveEffectiveHamaliRate(undefined, null)).toBe(0);
  });
});
