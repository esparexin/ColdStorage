import mongoose from 'mongoose';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { connectToTestDatabase, disconnectTestDatabase, resetStockCollections } from './helpers/stock-reset.js';
import { CommodityModel } from '../database/models/commodity.model.js';
import { CommodityRateModel } from '../database/models/commodity-rate.model.js';
import { CustomerModel } from '../database/models/customer.model.js';
import { FacilityModel } from '../database/models/facility.model.js';
import { GrnModel } from '../database/models/grn.model.js';
import { createGrn } from '../modules/grn/handlers/create-grn.handler.js';
import { internalMovementService } from '../modules/internal-movement/internal-movement.service.js';
import { readLedgerBalance } from '../modules/inventory/ledger-balance.js';
import { parseMergedConsignmentBreakdown } from '@cold-storage/contracts';

describe('Merge Physical Repack Variance & Consolidation', { timeout: 30000 }, () => {
  const facilityId = 'fac-repack-variance';
  const customerId = 'cust-repack-variance';
  const userId = 'usr-repack-variance';
  let seq = 0;

  const originalEnv = process.env.ALLOW_HISTORICAL_TESTING_DATES;

  beforeAll(async () => {
    process.env.ALLOW_HISTORICAL_TESTING_DATES = 'true';
    await connectToTestDatabase();
  });

  afterAll(async () => {
    if (originalEnv !== undefined) {
      process.env.ALLOW_HISTORICAL_TESTING_DATES = originalEnv;
    } else {
      delete process.env.ALLOW_HISTORICAL_TESTING_DATES;
    }
    await disconnectTestDatabase();
  });

  beforeEach(async () => {
    await resetStockCollections();
    await CommodityRateModel.deleteMany({});
    await mongoose.connection.collection('rentextensions').deleteMany({});
    await FacilityModel.create({ id: facilityId, name: 'Repack Fac', code: 'RF', isActive: true });
    await CustomerModel.create({ id: customerId, name: 'Farmer Variance', facilityIds: [facilityId], isActive: true });
    await CommodityModel.create({
      id: 'cmd-repack', name: 'Repack Potato', normalizedName: 'repack potato',
      seasonDuration: 'Seasonal', isHamaliApplicable: true, hamaliRate: 5, isActive: true,
    });
  }, 30000);

  async function makeGrn(bags: number, small = bags, big = 0, bagType: 'S' | 'B' | 'S/B' = 'S', inwardDate = new Date('2026-03-01')) {
    seq += 1;
    const { grn } = await createGrn(
      facilityId,
      {
        grnNumber: `${8200 + seq}`, date: inwardDate, customerId, commodityId: 'cmd-repack',
        chamber: 'CH-1', bags, smallBags: small, bigBags: big, bagType, rentType: 'Seasonal',
        smallBagPrice: 20, bigBagPrice: 25, bagPrice: 20, rentAmount: bags * 20,
      },
      userId,
      { requireRates: false },
    );
    return grn;
  }

  it('consolidates 4 source GRNs totaling 400 bags and allows repacking into 350 bags (-50 bags shrinkage)', async () => {
    // 4 sources: 50, 100, 150, 100 = 400 bags
    const s1 = await makeGrn(50, 50, 0, 'S');
    const s2 = await makeGrn(100, 40, 60, 'S/B');
    const s3 = await makeGrn(150, 150, 0, 'S');
    const s4 = await makeGrn(100, 0, 100, 'B');
    // Target GRN with 200 bags
    const target = await makeGrn(200, 100, 100, 'S/B');

    // Operator repacks 400 source bags into 350 bags: 200 Small, 150 Big
    const res = await internalMovementService.mergeGrn(facilityId, {
      targetGrnId: target.id,
      sourceGrnIds: [s1.id, s2.id, s3.id, s4.id],
      isRepackSelected: true,
      repackedSmallBags: 200,
      repackedBigBags: 150,
      repackVarianceReason: 'Damaged and rotted tubers discarded during sorting and grading',
      remarks: 'Sorting and repacking 4 source consignments into consolidated bags',
      movementDate: new Date('2026-04-10'),
    }, userId);

    // Target stock must increase by exactly 350 bags: 200 original + 350 repacked = 550
    expect(res.targetGrn.bags).toBe(550);
    expect(res.targetGrn.smallBags).toBe(300); // 100 + 200
    expect(res.targetGrn.bigBags).toBe(250);   // 100 + 150

    // Target ledger balance must reflect 550 bags
    const targetBal = await readLedgerBalance(facilityId, target.id);
    expect(targetBal.total).toBe(550);
    expect(targetBal.smallBags).toBe(300);
    expect(targetBal.bigBags).toBe(250);

    // All 4 source GRNs must be CLOSED with 0 remaining ledger balance, preserving their individual original rent
    const d1 = await GrnModel.findOne({ id: s1.id }).lean().exec();
    const d2 = await GrnModel.findOne({ id: s2.id }).lean().exec();
    const d3 = await GrnModel.findOne({ id: s3.id }).lean().exec();
    const d4 = await GrnModel.findOne({ id: s4.id }).lean().exec();
    expect(d1?.rentAmount).toBe(50 * 20); // 1000, not 350
    expect(d2?.rentAmount).toBe(40 * 20 + 60 * 25); // 2300
    expect(d3?.rentAmount).toBe(150 * 20); // 3000
    expect(d4?.rentAmount).toBe(100 * 25); // 2500

    for (const s of [s1, s2, s3, s4]) {
      const doc = await GrnModel.findOne({ id: s.id }).lean().exec();
      expect(doc?.status).toBe('CLOSED');
      expect(doc?.mergedIntoGrnId).toBe(target.id);
      const bal = await readLedgerBalance(facilityId, s.id);
      expect(bal.total).toBe(0);
    }

    // Repack Hamali must be charged on the 350 physically repacked bags @ ₹5 = ₹1,750
    expect(res.movement.hamaliBags).toBe(350);
    expect(res.movement.hamaliRate).toBe(5);
    expect(res.movement.hamaliCharge).toBe(1750);
    expect(res.movement.repackVariance).toBe(-50);
    expect(res.movement.repackSourceBags).toBe(400);

    // Target remarks must include variance note
    expect(res.targetGrn.remarks).toContain('Repacked: 200 S + 150 B = 350 bags; Variance from 400 source bags: -50 bags');

    // Parsed breakdown must successfully extract variance
    const breakdown = parseMergedConsignmentBreakdown(res.targetGrn.remarks, 550, 'Farmer Variance');
    expect(breakdown).not.toBeNull();
    expect(breakdown?.totalMergedAddedBags).toBe(350);
    expect(breakdown?.repackVariance).toBe(-50);
    expect(breakdown?.repackSourceBags).toBe(400);
    expect(breakdown?.repackHamali?.amount).toBe(1750);
    expect(breakdown?.repackHamali?.repackBags).toBe(350);
  });

  it('allows repacking 400 source bags into 450 bags (+50 bags smaller packaging)', async () => {
    const s1 = await makeGrn(200, 200, 0, 'S');
    const s2 = await makeGrn(200, 100, 100, 'S/B');
    const target = await makeGrn(100, 50, 50, 'S/B');

    // Operator repacks 400 source bags into 450 bags: 250 Small, 200 Big
    const res = await internalMovementService.mergeGrn(facilityId, {
      targetGrnId: target.id,
      sourceGrnIds: [s1.id, s2.id],
      isRepackSelected: true,
      repackedSmallBags: 250,
      repackedBigBags: 200,
      remarks: 'Repacked from 50kg bags into 40kg smaller retail bags',
      movementDate: new Date('2026-04-10'),
    }, userId);

    expect(res.targetGrn.bags).toBe(550); // 100 + 450
    expect(res.movement.totalBagsMoved).toBe(450);
    expect(res.movement.repackVariance).toBe(50);
    expect(res.movement.repackSourceBags).toBe(400);
    expect(res.movement.hamaliCharge).toBe(450 * 5); // 2250
    expect(res.targetGrn.remarks).toContain('Variance from 400 source bags: +50 bags');
  });

  it('rejects count mismatch when isRepackSelected is false (standard merge requires 1:1 parity)', async () => {
    const s1 = await makeGrn(100);
    const target = await makeGrn(100);

    await expect(
      internalMovementService.mergeGrn(facilityId, {
        targetGrnId: target.id,
        sourceGrnIds: [s1.id],
        isRepackSelected: false,
        repackedSmallBags: 60,
        repackedBigBags: 20, // 80 != 100
        remarks: 'Attempted unequal split without repacking',
        movementDate: new Date('2026-04-10'),
      }, userId),
    ).rejects.toThrow('Confirmed Small (60) and Big (20) bags must equal Total Bags (100)');
  });
});
