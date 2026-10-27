import { describe, expect, it } from 'vitest';
import {
  allocateHybridSplit,
  calculateHamaliAmount,
  resolveMergedBagType,
} from '@cold-storage/contracts';
import { buildMergePayload } from '../internalMovementPayload.helper';

describe('Physical Repacking & Variance Workflow (Frontend Unit & Payload Tests)', () => {
  const totalSourceBags = 400; // e.g. 4 source GRNs of 100 bags each
  const commodityHamaliRate = 5;

  describe('Section B S/B Repacking with Count Variance', () => {
    it('handles smaller packaging variance (400 source bags -> 450 repacked bags)', () => {
      const repackSmall = 250;
      const repackBig = 200;
      const actualRepackedBags = repackSmall + repackBig; // 450
      const repackVariance = actualRepackedBags - totalSourceBags; // +50

      expect(actualRepackedBags).toBe(450);
      expect(repackVariance).toBe(50);

      // Repacking Hamali is assessed on confirmed repacked bags (450 * 5 = 2250)
      const repackHamaliCharge = calculateHamaliAmount(actualRepackedBags, commodityHamaliRate);
      expect(repackHamaliCharge).toBe(2250);

      const targetCurrentRemaining = 100;
      const targetNewRemaining = targetCurrentRemaining + actualRepackedBags;
      expect(targetNewRemaining).toBe(550);

      const payload = buildMergePayload(
        'target-grn-01',
        ['src-1', 'src-2', 'src-3', 'src-4'],
        'Repacked into 450 bags due to smaller bag specifications',
        'Physical repack variance verified',
        '2026-10-27',
        0,
        repackSmall,
        repackBig,
        4500, // Reference weight
        undefined,
        undefined,
        'S/B',
        undefined,
        undefined,
        undefined,
        undefined,
        true, // isRepackSelected
        actualRepackedBags,
      );

      expect(payload.isRepackSelected).toBe(true);
      expect(payload.repackedSmallBags).toBe(250);
      expect(payload.repackedBigBags).toBe(200);
      expect(payload.repackedBagCount).toBe(450);
      expect(payload.remarks).toContain('smaller bag specifications');
    });

    it('handles shrinkage / stock loss variance (400 source bags -> 350 repacked bags)', () => {
      const repackSmall = 200;
      const repackBig = 150;
      const actualRepackedBags = repackSmall + repackBig; // 350
      const repackVariance = actualRepackedBags - totalSourceBags; // -50

      expect(actualRepackedBags).toBe(350);
      expect(repackVariance).toBe(-50);

      const repackHamaliCharge = calculateHamaliAmount(actualRepackedBags, commodityHamaliRate);
      expect(repackHamaliCharge).toBe(1750); // 350 * 5 = 1750

      const payload = buildMergePayload(
        'target-grn-01',
        ['src-1', 'src-2', 'src-3', 'src-4'],
        'Repacked with 50 bags shrinkage/loss',
        undefined,
        '2026-10-27',
        0,
        repackSmall,
        repackBig,
        3500,
        undefined,
        undefined,
        'S/B',
        undefined,
        undefined,
        undefined,
        undefined,
        true,
        actualRepackedBags,
      );

      expect(payload.isRepackSelected).toBe(true);
      expect(payload.repackedSmallBags).toBe(200);
      expect(payload.repackedBigBags).toBe(150);
      expect(payload.repackedBagCount).toBe(350);
    });
  });

  describe('Section B Hybrid Repacking with Count Variance', () => {
    it('supports Hybrid repacking with variance (400 source bags -> 600 repacked bags)', () => {
      const repackQuantity = 600;
      const actualRepackedBags = repackQuantity;
      const repackVariance = actualRepackedBags - totalSourceBags; // +200

      expect(repackVariance).toBe(200);

      const repackHamaliCharge = calculateHamaliAmount(actualRepackedBags, commodityHamaliRate);
      expect(repackHamaliCharge).toBe(3000); // 600 * 5 = 3000

      // Split allocation into ledger S and B bags
      const split = allocateHybridSplit(200, 200, actualRepackedBags);
      expect(split.smallBags + split.bigBags).toBe(600);

      const payload = buildMergePayload(
        'target-grn-01',
        ['src-1', 'src-2'],
        'Repacked into 600 Hybrid bags',
        undefined,
        '2026-10-27',
        0,
        split.smallBags,
        split.bigBags,
        undefined,
        undefined,
        undefined,
        'Hybrid',
        repackQuantity,
        15, // bagPrice
        undefined,
        undefined,
        true,
        actualRepackedBags,
      );

      expect(payload.isRepackSelected).toBe(true);
      expect(payload.sourceBagCategory).toBe('Hybrid');
      expect(payload.sourceQuantity).toBe(600);
      expect(payload.repackedBagCount).toBe(600);
      expect(payload.sourceBagPrice).toBe(15);
      expect((payload.repackedSmallBags ?? 0) + (payload.repackedBigBags ?? 0)).toBe(600);
    });
  });

  describe('Destination Bag Type Resolution after Repacking', () => {
    it('resolves destination bagType as S/B when repacked as S/B', () => {
      const resulting = resolveMergedBagType({
        targetBagType: 'S/B',
        sourceBagTypes: ['S/B'],
        newSmallBags: 300,
        newBigBags: 250,
      });
      expect(resulting).toBe('S/B');
    });

    it('resolves destination bagType as Hybrid when repacked as Hybrid', () => {
      const resulting = resolveMergedBagType({
        targetBagType: 'Hybrid',
        sourceBagTypes: ['Hybrid'],
        newSmallBags: 300,
        newBigBags: 300,
      });
      expect(resulting).toBe('Hybrid');
    });
  });
});
