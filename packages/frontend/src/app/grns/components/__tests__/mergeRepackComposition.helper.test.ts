import { describe, expect, it } from 'vitest';
import type { Grn } from '@cold-storage/contracts';
import {
  deriveRepackCompositionStatus,
  deriveMovedAndTargetBags,
} from '../mergeRepackComposition.helper';
import { buildMergeExecutionPayload } from '../mergeExecutionPayload.helper';
import { DEFAULT_BAG_CONFIRMATION } from '../bagConfirmation.helper';

describe('mergeRepackComposition.helper', () => {
  const sampleTargetGrn = {
    id: 'grn-target-1',
    facilityId: 'fac-1',
    customerId: 'cust-1',
    commodityId: 'cmd-1',
    grnNumber: '1001',
    date: new Date('2026-03-15'),
    bags: 100,
    closingBags: 100,
    bagType: 'S/B',
    isCompositionVerified: true,
    smallBags: 60,
    bigBags: 40,
    smallBagPrice: 20,
    bigBagPrice: 30,
  } as unknown as Grn;

  const sampleSourceGrn = {
    id: 'grn-source-1',
    facilityId: 'fac-1',
    customerId: 'cust-1',
    commodityId: 'cmd-1',
    grnNumber: '1002',
    date: new Date('2026-03-20'),
    bags: 50,
    closingBags: 50,
    bagType: 'S/B',
    isCompositionVerified: true,
    smallBags: 30,
    bigBags: 20,
    smallBagPrice: 20,
    bigBagPrice: 30,
  } as unknown as Grn;

  describe('deriveRepackCompositionStatus', () => {
    it('detects differential rates and verified state', () => {
      const res = deriveRepackCompositionStatus({
        targetGrn: sampleTargetGrn,
        selectedSources: [sampleSourceGrn],
        repackMode: false,
        repackBagType: 'S/B',
        repackQuantity: '',
        repackSmall: '',
        repackBig: '',
      });
      expect(res.isTargetDiff).toBe(true);
      expect(res.isTargetVerified).toBe(true);
      expect(res.allSourcesVerified).toBe(true);
      expect(res.isRepackRequired).toBe(false);
      expect(res.isRepackFilled).toBe(false);
      expect(res.actualRepackedBags).toBe(0);
    });

    it('requires repack if target is unverified with differential rates', () => {
      const unverifiedTarget = { ...sampleTargetGrn, isCompositionVerified: false };
      const res = deriveRepackCompositionStatus({
        targetGrn: unverifiedTarget,
        selectedSources: [sampleSourceGrn],
        repackMode: false,
        repackBagType: 'S/B',
        repackQuantity: '',
        repackSmall: '',
        repackBig: '',
      });
      expect(res.isRepackRequired).toBe(true);
    });

    it('calculates actualRepackedBags for S/B and Hybrid', () => {
      const sbRes = deriveRepackCompositionStatus({
        targetGrn: sampleTargetGrn,
        selectedSources: [sampleSourceGrn],
        repackMode: true,
        repackBagType: 'S/B',
        repackQuantity: '',
        repackSmall: 25,
        repackBig: 25,
      });
      expect(sbRes.isRepackFilled).toBe(true);
      expect(sbRes.actualRepackedBags).toBe(50);

      const hybridRes = deriveRepackCompositionStatus({
        targetGrn: sampleTargetGrn,
        selectedSources: [sampleSourceGrn],
        repackMode: true,
        repackBagType: 'Hybrid',
        repackQuantity: 50,
        repackSmall: '',
        repackBig: '',
      });
      expect(hybridRes.isRepackFilled).toBe(true);
      expect(hybridRes.actualRepackedBags).toBe(50);
    });
  });

  describe('deriveMovedAndTargetBags', () => {
    it('correctly sums source confirmed bags without repack', () => {
      const res = deriveMovedAndTargetBags({
        selectedSources: [sampleSourceGrn],
        sourceConfirmations: {
          [sampleSourceGrn.id]: {
            ...DEFAULT_BAG_CONFIRMATION,
            category: 'S/B',
            smallBags: 30,
            bigBags: 20,
          },
        },
        repackMode: false,
        repackBagType: 'S/B',
        isRepackFilled: false,
        repackSmall: '',
        repackBig: '',
        repackQuantity: '',
        totalSourceBags: 50,
        targetCurrentRemaining: 100,
        targetBagType: 'S/B',
        actualRepackedBags: 0,
      });

      expect(res.confSmall).toBe(30);
      expect(res.confBig).toBe(20);
      expect(res.movedSmall).toBe(30);
      expect(res.movedBig).toBe(20);
      expect(res.addedBagsToTarget).toBe(50);
      expect(res.targetNewRemaining).toBe(150);
      expect(res.effectiveIsHybrid).toBe(false);
    });
  });

  describe('buildMergeExecutionPayload', () => {
    it('constructs correct payload for standard non-repack merge', () => {
      const payload = buildMergeExecutionPayload({
        repackMode: false,
        repackBagType: 'S/B',
        repackSmall: '',
        repackBig: '',
        repackQuantity: '',
        repackBagPrice: '',
        repackSeasonalBagPrice: '',
        repackMonthlyBagPrice: '',
        isRepackFilled: false,
        isRepackRequired: false,
        movedSmall: 30,
        movedBig: 20,
        totalSourceBags: 50,
        primaryConf: {
          ...DEFAULT_BAG_CONFIRMATION,
          category: 'S/B',
          smallBags: 30,
          bigBags: 20,
        },
      });

      expect(payload.effSmall).toBe(30);
      expect(payload.effBig).toBe(20);
      expect(payload.resolvedCategory).toBe('S/B');
      expect(payload.effRepackedBagCount).toBeUndefined();
    });
  });
});
