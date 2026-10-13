import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
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
import { internalMovementService } from '../modules/internal-movement/internal-movement.service.js';

/**
 * Phase 3 — Repack + merge hamali (feat/hamali-accounting-integrity).
 * Additive reconcile: destination rate preserved; sources carry outstanding
 * hamali (remaining x source rate); explicit hamaliBags create one new charge.
 */
describe('Merge hamali — additive reconcile', () => {
  const facilityId = 'fac-hamali-merge';
  const customerId = 'cust-hamali-merge';
  const userId = 'usr-hamali-merge';
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
    await InventoryTransactionModel.deleteMany({});
    await InternalMovementModel.deleteMany({});
    await FacilityModel.create({ id: facilityId, name: 'Merge Facility', code: 'MRG', isActive: true });
    await CustomerModel.create({ id: customerId, name: 'Merge Farmer', facilityIds: [facilityId], isActive: true });
    await CommodityModel.create({
      id: 'cmd-mrg', name: 'Merge Potato', normalizedName: 'merge potato',
      seasonDuration: 'Seasonal', isHamaliApplicable: true, hamaliRate: 4, isActive: true,
    });
    await CommodityRateModel.create({
      id: 'crt-mrg-s', commodityId: 'cmd-mrg', rentType: 'Seasonal',
      smallRate: 30, bigRate: 35, hamaliRate: 999, isActive: true,
    });
  });

  let seq = 0;
  async function makeGrn(bags: number, hamaliRate?: number, bagType: 'S' | 'B' | 'S+B' | 'S/B' = 'S') {
    seq += 1;
    const isSplit = bagType === 'S+B';
    const smallBags = isSplit ? Math.floor(bags / 2) : undefined;
    const bigBags = isSplit ? bags - (smallBags ?? 0) : undefined;
    const rentAmount = isSplit
      ? (smallBags ?? 0) * 30 + (bigBags ?? 0) * 35
      : bagType === 'B' ? bags * 35 : bags * 30;
    const { grn } = await createGrn(
      facilityId,
      {
        grnNumber: `${7000 + seq}`, date: new Date('2026-01-05'), customerId, commodityId: 'cmd-mrg',
        chamber: 'CH-1', bags, bagType,
        ...(smallBags !== undefined ? { smallBags } : {}),
        ...(bigBags !== undefined ? { bigBags } : {}),
        rentType: 'Seasonal',
        smallBagPrice: 30, bigBagPrice: 35, rentAmount,
        ...(hamaliRate !== undefined ? { hamaliRate } : {}),
      },
      userId,
      { requireRates: false },
    );
    return grn;
  }

  it('carries source hamali into destination without new charge by default', async () => {
    const target = await makeGrn(100);
    const source = await makeGrn(50);
    expect(target.hamaliAmount).toBe(400);
    expect(source.hamaliAmount).toBe(200);
    const { targetGrn, movement } = await internalMovementService.mergeGrn(
      facilityId,
      { targetGrnId: target.id, sourceGrnIds: [source.id], movementDate: new Date('2026-02-01'), additionalRentAmount: 0, remarks: 'Carry test merge' },
      userId,
    );
    expect(targetGrn.hamaliRate).toBe(4);
    expect(targetGrn.hamaliAmount).toBe(600);
    expect(movement.hamaliBags).toBe(0);
    expect(movement.hamaliCharge).toBe(0);
    expect(movement.hamaliCarried).toBe(200);
    expect(movement.hamaliRate).toBe(4);
    expect(movement.financialSnapshot.hamaliAmount).toBe(600);
    expect(targetGrn.bags).toBe(150);
  });

  it('adds explicit repack charge for selected bags only', async () => {
    const target = await makeGrn(100);
    const source = await makeGrn(50);
    const { targetGrn, movement } = await internalMovementService.mergeGrn(
      facilityId,
      {
        targetGrnId: target.id, sourceGrnIds: [source.id], movementDate: new Date('2026-02-01'),
        additionalRentAmount: 0, remarks: 'Partial repack merge', hamaliBags: 20,
      },
      userId,
    );
    expect(movement.hamaliBags).toBe(20);
    expect(movement.hamaliCharge).toBe(80);
    expect(movement.hamaliCarried).toBe(200);
    expect(targetGrn.hamaliAmount).toBe(680);
    expect(targetGrn.hamaliRate).toBe(4);
  });

  it('preserves differing historical source rates instead of recalculating', async () => {
    const target = await makeGrn(100, 4);
    const source = await makeGrn(50, 6);
    expect(source.hamaliAmount).toBe(300);
    const { targetGrn, movement } = await internalMovementService.mergeGrn(
      facilityId,
      {
        targetGrnId: target.id, sourceGrnIds: [source.id], movementDate: new Date('2026-02-01'),
        additionalRentAmount: 0, remarks: 'Mixed rate merge', hamaliBags: 20,
      },
      userId,
    );
    expect(movement.hamaliCarried).toBe(300);
    expect(movement.hamaliCharge).toBe(80);
    expect(targetGrn.hamaliAmount).toBe(780);
    expect(targetGrn.hamaliRate).toBe(4);
  });

  it('carries only remaining hamali after partial outward delivery', async () => {
    const target = await makeGrn(100);
    const source = await makeGrn(100);
    await createDeliveryWithRetry(facilityId, { grnId: source.id, smallBags: 40, bigBags: 0 }, userId);
    const { targetGrn, movement } = await internalMovementService.mergeGrn(
      facilityId,
      { targetGrnId: target.id, sourceGrnIds: [source.id], movementDate: new Date('2026-02-01'), additionalRentAmount: 0, remarks: 'Post-outward merge' },
      userId,
    );
    expect(movement.hamaliCarried).toBe(240);
    expect(targetGrn.hamaliAmount).toBe(640);
  });

  it('rejects hamaliBags exceeding moved stock and prevents duplicate merge charges', async () => {
    const target = await makeGrn(100);
    const source = await makeGrn(50);
    await expect(
      internalMovementService.mergeGrn(
        facilityId,
        {
          targetGrnId: target.id, sourceGrnIds: [source.id], movementDate: new Date('2026-02-01'),
          additionalRentAmount: 0, remarks: 'Oversized hamali selection', hamaliBags: 9999,
        },
        userId,
      ),
    ).rejects.toThrow(/cannot exceed total moved stock/);
    const first = await internalMovementService.mergeGrn(
      facilityId,
      {
        targetGrnId: target.id, sourceGrnIds: [source.id], movementDate: new Date('2026-02-01'),
        additionalRentAmount: 0, remarks: 'First merge ok', hamaliBags: 10,
      },
      userId,
    );
    expect(first.targetGrn.hamaliAmount).toBe(400 + 200 + 40);
    await expect(
      internalMovementService.mergeGrn(
        facilityId,
        { targetGrnId: target.id, sourceGrnIds: [source.id], movementDate: new Date('2026-02-02'), additionalRentAmount: 0, remarks: 'Duplicate merge retry' },
        userId,
      ),
    ).rejects.toThrow(/already CLOSED/);
    const persisted = await GrnModel.findOne({ id: target.id }).lean().exec();
    expect(persisted?.hamaliAmount).toBe(640);
  });

  it('keeps hamali bag-agnostic across S, B, S+B and Hybrid compositions', async () => {
    const tS = await makeGrn(50, 4, 'S');
    const sB = await makeGrn(50, 4, 'B');
    const r1 = await internalMovementService.mergeGrn(
      facilityId,
      {
        targetGrnId: tS.id, sourceGrnIds: [sB.id], movementDate: new Date('2026-02-01'),
        additionalRentAmount: 0, remarks: 'S plus B merge', hamaliBags: 50,
      },
      userId,
    );
    expect(r1.movement.hamaliCharge).toBe(200);
    expect(r1.targetGrn.hamaliAmount).toBe(200 + 200 + 200);
    const tMix = await makeGrn(60, 4, 'S+B');
    const sMix = await makeGrn(40, 4, 'S+B');
    const r2 = await internalMovementService.mergeGrn(
      facilityId,
      {
        targetGrnId: tMix.id, sourceGrnIds: [sMix.id], movementDate: new Date('2026-02-01'),
        additionalRentAmount: 0, remarks: 'S+B merge', hamaliBags: 40,
        repackedSmallBags: 20, repackedBigBags: 20,
      },
      userId,
    );
    expect(r2.movement.hamaliCharge).toBe(160);
    expect(r2.targetGrn.hamaliAmount).toBe(240 + 160 + 160);
  });
});
