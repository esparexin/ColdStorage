import { isBagCompositionVerified } from '@cold-storage/contracts';
import type { MergeSourceGrn } from './merge-grn.helper.js';

export interface ValidateMergeRepackedParams {
  targetGrn: {
    smallBagPrice?: number | null;
    bigBagPrice?: number | null;
  };
  sourceGrns: MergeSourceGrn[];
  repackedSmallBags?: number | null;
  repackedBigBags?: number | null;
  totalMovedBags: number;
}

export function validateMergeRepackedCounts(params: ValidateMergeRepackedParams): {
  smallMoved: number;
  bigMoved: number;
} {
  const { targetGrn, sourceGrns, repackedSmallBags, repackedBigBags, totalMovedBags } = params;

  const isDiffTarget =
    (targetGrn.smallBagPrice != null || targetGrn.bigBagPrice != null) &&
    targetGrn.smallBagPrice !== targetGrn.bigBagPrice;

  const requiresComposition =
    isDiffTarget ||
    sourceGrns.some(
      (s) =>
        ((s.smallBagPrice != null || s.bigBagPrice != null) && s.smallBagPrice !== s.bigBagPrice) ||
        !isBagCompositionVerified({
          bagType: s.bagType,
          bags: s.bags,
          smallBags: s.smallBags,
          bigBags: s.bigBags,
        }),
    );

  if (requiresComposition && (repackedSmallBags == null || repackedBigBags == null)) {
    throw new Error(
      'Confirmed small and big bag counts are required when merging lots with unverified composition or differential rates',
    );
  }

  if (repackedSmallBags != null && repackedBigBags != null) {
    if (repackedSmallBags < 0 || repackedBigBags < 0) {
      throw new Error('Bag counts cannot be negative');
    }
    if (repackedSmallBags > totalMovedBags || repackedBigBags > totalMovedBags) {
      throw new Error(
        `Neither small nor big bag count can exceed total moved stock of ${totalMovedBags} bags`,
      );
    }
    const sum = repackedSmallBags + repackedBigBags;
    if (sum !== totalMovedBags) {
      throw new Error(
        `Confirmed repacked counts (${repackedSmallBags} small + ${repackedBigBags} big = ${sum}) must reconcile with total moved stock of ${totalMovedBags} bags`,
      );
    }
    return { smallMoved: repackedSmallBags, bigMoved: repackedBigBags };
  }

  const defaultSmall = sourceGrns.reduce((acc, s) => acc + (s.smallBags ?? 0), 0);
  const defaultBig = sourceGrns.reduce((acc, s) => acc + (s.bigBags ?? 0), 0);
  return { smallMoved: defaultSmall, bigMoved: defaultBig };
}
