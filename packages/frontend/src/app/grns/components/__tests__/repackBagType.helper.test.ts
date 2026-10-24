import { describe, expect, it } from 'vitest';
import {
  allocateHybridSplit,
  deriveHybridRateVisibility,
  hasPositiveHybridRate,
  HYBRID_RATE_REQUIRED_MESSAGE,
  isHybridBagCategory,
  resolveMergedBagType,
  resolveOutwardRates,
  validateHybridQuantityInput,
} from '@cold-storage/contracts';
import { buildMergePayload } from '../internalMovementPayload.helper';

describe('Step 4: Repack & Confirm Bag Type (S/B and Hybrid) Business Logic', () => {
  describe('Bag Type Selection & Repacking', () => {
    it('supports S/B repacking with decoupled physical counts and resolves rates', () => {
      const targetGrn = {
        rentType: 'Seasonal' as const,
        smallBagPrice: 12,
        bigBagPrice: 18,
        bagPrice: null,
      };
      const rates = resolveOutwardRates(targetGrn.rentType, targetGrn);
      expect(rates.small).toBe(12);
      expect(rates.big).toBe(18);

      // Repacking 50 total source bags into 35 Small and 15 Big bags
      const repackedSmall = 35;
      const repackedBig = 15;
      const totalRepacked = repackedSmall + repackedBig;
      expect(totalRepacked).toBe(50);

      const payload = buildMergePayload(
        'target-123',
        ['source-456'],
        'Repacking lot during merge',
        undefined,
        '2026-10-23',
        0,
        repackedSmall,
        repackedBig,
        2500, // Reference weight
        undefined,
        undefined,
        'S/B',
        undefined,
        undefined,
        undefined,
        undefined,
        true, // isRepackSelected
        totalRepacked,
      );

      expect(payload.isRepackSelected).toBe(true);
      expect(payload.sourceBagCategory).toBe('S/B');
      expect(payload.repackedSmallBags).toBe(35);
      expect(payload.repackedBigBags).toBe(15);
      expect(payload.repackedBagCount).toBe(50);
      expect(payload.referenceWeight).toBe(2500);
      expect(payload.movementDate).toBe('2026-10-23');
    });

    it('supports Hybrid repacking with rate visibility and split allocation', () => {
      const targetGrn = {
        rentType: 'Seasonal' as const,
        date: new Date('2026-03-01'),
        bagType: 'Hybrid' as const,
        smallBagPrice: null,
        bigBagPrice: null,
        bagPrice: 15,
      };

      const visibility = deriveHybridRateVisibility({
        rentType: targetGrn.rentType,
        inwardDate: targetGrn.date,
        deliveryDate: '2026-10-23',
      });
      expect(typeof visibility.showSeasonalRate).toBe('boolean');
      expect(typeof visibility.showMonthlyRate).toBe('boolean');

      const totalSourceBags = 80;
      const repackQuantity = 80;

      // Validate Hybrid quantity
      const validErr = validateHybridQuantityInput(repackQuantity, totalSourceBags, 'total moved stock');
      expect(validErr).toBeNull();

      const invalidErr = validateHybridQuantityInput(70, totalSourceBags, 'total moved stock');
      expect(invalidErr).toContain('must match total moved stock of 80 bags');

      // Rate presence validation
      expect(hasPositiveHybridRate({ bagPrice: '', seasonalBagPrice: '', monthlyBagPrice: '' })).toBe(false);
      expect(HYBRID_RATE_REQUIRED_MESSAGE).toBeDefined();
      expect(hasPositiveHybridRate({ bagPrice: 15, seasonalBagPrice: '', monthlyBagPrice: '' })).toBe(true);

      // Ledger split calculation via allocateHybridSplit
      const rawSmall = 50;
      const rawBig = 30;
      const split = allocateHybridSplit(rawSmall, rawBig, repackQuantity);
      expect(split.smallBags).toBe(50);
      expect(split.bigBags).toBe(30);

      const payload = buildMergePayload(
        'target-123',
        ['source-456'],
        'Repacking as Hybrid',
        undefined,
        '2026-10-23',
        0,
        split.smallBags,
        split.bigBags,
        undefined,
        undefined,
        undefined,
        'Hybrid',
        repackQuantity,
        15,
        undefined,
        undefined,
        true,
        repackQuantity,
      );

      expect(payload.isRepackSelected).toBe(true);
      expect(payload.sourceBagCategory).toBe('Hybrid');
      expect(payload.sourceQuantity).toBe(80);
      expect(payload.repackedBagCount).toBe(80);
      expect(payload.sourceBagPrice).toBe(15);
      expect(payload.repackedSmallBags).toBe(50);
      expect(payload.repackedBigBags).toBe(30);
    });

    it('resolves merged bag type accurately based on actual repacked composition', () => {
      // Merging into S/B target
      const targetBagType = 'S/B';
      const resultingSb = resolveMergedBagType({
        targetBagType,
        sourceBagTypes: ['S/B'],
        newSmallBags: 60,
        newBigBags: 40,
      });
      expect(resultingSb).toBe('S/B');

      // Merging Hybrid into Hybrid target maintains Hybrid
      const resultingHybrid = resolveMergedBagType({
        targetBagType: 'Hybrid',
        sourceBagTypes: ['Hybrid'],
        newSmallBags: 50,
        newBigBags: 50,
      });
      expect(resultingHybrid).toBe('Hybrid');

      // Merging S/B into Hybrid target transitions to mixed (S+B)
      const transitionedMixed = resolveMergedBagType({
        targetBagType: 'Hybrid',
        sourceBagTypes: ['S'],
        newSmallBags: 50,
        newBigBags: 50,
      });
      expect(transitionedMixed).toBe('S+B');
    });

    it('ensures isHybridBagCategory correctly identifies Hybrid category aliases', () => {
      expect(isHybridBagCategory('Hybrid')).toBe(true);
      expect(isHybridBagCategory('hybrid')).toBe(true);
      expect(isHybridBagCategory('Mixed')).toBe(true);
      expect(isHybridBagCategory('Modern')).toBe(true);
      expect(isHybridBagCategory('S/B')).toBe(false);
      expect(isHybridBagCategory('S+B')).toBe(false);
      expect(isHybridBagCategory('S')).toBe(false);
      expect(isHybridBagCategory('B')).toBe(false);
    });
  });
});
