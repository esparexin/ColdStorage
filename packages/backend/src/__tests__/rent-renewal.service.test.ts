import mongoose from 'mongoose';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { connectToDatabase, disconnectDatabase } from '../database/connection.js';
import { CommodityModel } from '../database/models/commodity.model.js';
import { CommodityRateModel } from '../database/models/commodity-rate.model.js';
import { CounterModel } from '../database/models/counter.model.js';
import { CustomerModel } from '../database/models/customer.model.js';
import { FacilityModel } from '../database/models/facility.model.js';
import { GrnModel } from '../database/models/grn.model.js';
import { InventoryTransactionModel } from '../database/models/inventory-transaction.model.js';
import { rentExtensionService } from '../modules/rent/rent-extension.service.js';
import { rentExtensionRepository } from '../modules/rent/rent-extension.repository.js';
import { seedCustomer, seedFacility, seedGrn } from './helpers/master-data-fixtures.js';

const FACILITY_ID = 'fac-rent-renew';
const CUSTOMER_ID = 'cust-rent-renew';
const USER_ID = 'usr-admin-renew';

/**
 * Same-GRN recurring lifecycle: season 1 lives on Grn.rentAmount; every later
 * SEASON renewal and Jan/Feb monthly period is a separate idempotent row.
 * Seasonal = whole-season total (never ×10); Jan/Feb = one month.
 */
describe('Rent renewal — rent-renewal.service.test.ts', () => {
  beforeAll(async () => {
    await connectToDatabase();
  });

  afterAll(async () => {
    await disconnectDatabase();
  });

  beforeEach(async () => {
    await FacilityModel.deleteMany({});
    await CustomerModel.deleteMany({});
    await GrnModel.deleteMany({});
    await CounterModel.deleteMany({});
    await InventoryTransactionModel.deleteMany({});
    await CommodityModel.deleteMany({});
    await CommodityRateModel.deleteMany({});
    await mongoose.connection.collection('rentextensions').deleteMany({});
    await mongoose.connection.collection('rentpayments').deleteMany({});

    await seedFacility({ id: FACILITY_ID, name: 'Renew Facility', code: 'RENEW' });
    await seedCustomer({ id: CUSTOMER_ID, name: 'Renew Customer', facilityId: FACILITY_ID });
  });

  async function seedSeasonalGrn(opts: {
    inward: Date;
    bags?: number;
    bagType?: 'S' | 'B' | 'S+B';
    smallBags?: number;
    bigBags?: number;
    bagPrice?: number;
    rentAmount?: number;
    commodityId?: string;
  }): Promise<string> {
    const grnId = await seedGrn({
      facilityId: FACILITY_ID,
      customerId: CUSTOMER_ID,
      chamber: 'CH-01',
      bags: opts.bags ?? 100,
      bagType: opts.bagType ?? 'S',
      smallBags: opts.smallBags,
      bigBags: opts.bigBags,
      rentType: 'Seasonal',
      rentMonths: 10,
      rentAmount: opts.rentAmount ?? 1200,
      date: opts.inward,
      commodityId: opts.commodityId,
      grnNumber: `RNW-${Math.floor(Math.random() * 9000 + 1000)}`,
    });
    if (opts.bagPrice !== undefined) {
      await GrnModel.updateOne({ id: grnId }, { $set: { bagPrice: opts.bagPrice } }).exec();
    }
    return grnId;
  }

  it('finalizes a next-season SEASON renewal as a whole-season total', async () => {
    const grnId = await seedSeasonalGrn({ inward: new Date(2025, 5, 15), bagPrice: 12 });

    const ext = await rentExtensionService.finalizeExtension(
      FACILITY_ID,
      { grnId, seasonYear: 2026, period: 'SEASON' },
      USER_ID,
    );

    expect(ext.seasonYear).toBe(2026);
    expect(ext.period).toBe('SEASON');
    expect(ext.snapshotBags).toBe(100);
    expect(ext.calculatedAmount).toBe(1200);
    expect(ext.finalAmount).toBe(1200);

    const grn = await GrnModel.findOne({ id: grnId }).lean().exec();
    expect(grn?.rentAmount).toBe(1200);
  });

  it('rejects a SEASON renewal for the origin season (already on Grn.rentAmount)', async () => {
    const grnId = await seedSeasonalGrn({ inward: new Date(2025, 5, 15), bagPrice: 12 });

    await expect(
      rentExtensionService.finalizeExtension(FACILITY_ID, { grnId, seasonYear: 2025, period: 'SEASON' }, USER_ID),
    ).rejects.toThrow('already covered by its original seasonal rent');
  });

  it('rejects periods for seasons before the origin season', async () => {
    const grnId = await seedSeasonalGrn({ inward: new Date(2025, 5, 15), bagPrice: 12 });

    await expect(
      rentExtensionService.finalizeExtension(FACILITY_ID, { grnId, seasonYear: 2024, period: 'SEASON' }, USER_ID),
    ).rejects.toThrow('belongs to season 2025, not 2024');
  });

  it('keeps SEASON finalization idempotent: retry returns the existing row', async () => {
    const grnId = await seedSeasonalGrn({ inward: new Date(2025, 5, 15), bagPrice: 12 });

    const first = await rentExtensionService.finalizeExtension(
      FACILITY_ID,
      { grnId, seasonYear: 2026, period: 'SEASON' },
      USER_ID,
    );
    const second = await rentExtensionService.finalizeExtension(
      FACILITY_ID,
      { grnId, seasonYear: 2026, period: 'SEASON' },
      USER_ID,
    );

    expect(second.id).toBe(first.id);
    const count = await mongoose.connection
      .collection('rentextensions')
      .countDocuments({ grnId, seasonYear: 2026, period: 'SEASON' });
    expect(count).toBe(1);
  });

  it('accumulates season + Jan + Feb + renewal into one pending total', async () => {
    const grnId = await seedSeasonalGrn({ inward: new Date(2025, 5, 15), bagPrice: 12 });

    await rentExtensionService.finalizeExtension(FACILITY_ID, { grnId, seasonYear: 2025, period: 'JANUARY' }, USER_ID);
    await rentExtensionService.finalizeExtension(FACILITY_ID, { grnId, seasonYear: 2025, period: 'FEBRUARY' }, USER_ID);
    await rentExtensionService.finalizeExtension(FACILITY_ID, { grnId, seasonYear: 2026, period: 'SEASON' }, USER_ID);

    // 1200 season + 1200 Jan (100×12×1) + 1200 Feb + 1200 renewal
    const totalDue = await rentExtensionRepository.resolveTotalDue(FACILITY_ID, { id: grnId, rentAmount: 1200 });
    expect(totalDue).toBe(4800);

    const extensions = await rentExtensionService.getExtensionsForGrn(FACILITY_ID, grnId);
    expect(extensions).toHaveLength(3);
  });

  it('prices January from the controller monthly rate, not the stored rate', async () => {
    await CommodityModel.create({
      id: 'cmd-renew-1',
      name: 'Potato Renew',
      normalizedName: 'potato renew',
      isActive: true,
    });
    await CommodityRateModel.create({
      id: 'crt-renew-mo',
      commodityId: 'cmd-renew-1',
      rentType: 'Monthly',
      smallRate: 10,
      bigRate: 15,
      isActive: true,
    });
    const grnId = await seedSeasonalGrn({
      inward: new Date(2025, 5, 15),
      bagPrice: 99,
      rentAmount: 9900,
      commodityId: 'cmd-renew-1',
    });

    const ext = await rentExtensionService.finalizeExtension(
      FACILITY_ID,
      { grnId, seasonYear: 2025, period: 'JANUARY' },
      USER_ID,
    );

    // S-type snapshot of 100 bags × monthly small rate 10 (stored 99 ignored)
    expect(ext.calculatedAmount).toBe(1000);
    expect(ext.bagRate).toBe(10);
  });

  it('preserves the S+B split on seasonal renewal from controller rates', async () => {
    await CommodityModel.create({
      id: 'cmd-renew-2',
      name: 'Potato Split',
      normalizedName: 'potato split',
      isActive: true,
    });
    await CommodityRateModel.create({
      id: 'crt-renew-se',
      commodityId: 'cmd-renew-2',
      rentType: 'Seasonal',
      smallRate: 10,
      bigRate: 15,
      isActive: true,
    });
    const grnId = await seedSeasonalGrn({
      inward: new Date(2025, 5, 15),
      bagType: 'S+B',
      bags: 100,
      smallBags: 60,
      bigBags: 40,
      rentAmount: 1200,
      commodityId: 'cmd-renew-2',
    });

    const ext = await rentExtensionService.finalizeExtension(
      FACILITY_ID,
      { grnId, seasonYear: 2026, period: 'SEASON' },
      USER_ID,
    );

    // 60 × 10 + 40 × 15 = 1200 whole-season total
    expect(ext.calculatedAmount).toBe(1200);
    expect(ext.bagRate).toBe(12);
  });
});
