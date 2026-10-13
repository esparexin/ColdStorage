import { isBagCompositionVerified, seasonYearForInwardDate, type BagType } from '@cold-storage/contracts';
import type { MergeSourceGrn } from './merge-grn.helper.js';

export interface ValidateMergeRepackedParams {
  targetGrn: {
    bagType: BagType;
    bags: number;
    smallBags: number;
    bigBags: number;
    smallBagPrice?: number | null;
    bigBagPrice?: number | null;
    date: Date;
    grnNumber: string;
  };
  sourceGrns: MergeSourceGrn[];
  repackedSmallBags?: number | null;
  repackedBigBags?: number | null;
  totalMovedBags: number;
  movementDate: Date;
}

export function validateMergeRepackedCounts(params: ValidateMergeRepackedParams): {
  smallMoved: number;
  bigMoved: number;
} {
  const { targetGrn, sourceGrns, repackedSmallBags, repackedBigBags, totalMovedBags, movementDate } = params;

  // 1. Movement date sanity
  if (movementDate < new Date(targetGrn.date)) {
    throw new Error(`Movement date cannot predate target GRN '${targetGrn.grnNumber}' receipt date`);
  }
  for (const s of sourceGrns) {
    if (movementDate < new Date(s.date)) {
      throw new Error(`Movement date cannot predate source GRN '${s.grnNumber}' receipt date`);
    }
  }

  // 2. Season compatibility (source cannot be from a future season relative to target)
  const targetSeason = seasonYearForInwardDate(targetGrn.date);
  for (const s of sourceGrns) {
    const srcSeason = seasonYearForInwardDate(s.date);
    if (srcSeason > targetSeason) {
      throw new Error(
        `Season incompatibility: cannot merge future Season ${srcSeason} lot '${s.grnNumber}' into Season ${targetSeason} target GRN '${targetGrn.grnNumber}'`,
      );
    }
  }

  // 3. Composition verification on both sides
  const isDiffTarget =
    (targetGrn.smallBagPrice != null || targetGrn.bigBagPrice != null) &&
    targetGrn.smallBagPrice !== targetGrn.bigBagPrice;
  const isTargetVerified = isBagCompositionVerified(targetGrn);

  const requiresComposition =
    isDiffTarget ||
    !isTargetVerified ||
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

  let smallMoved = 0;
  let bigMoved = 0;

  if (repackedSmallBags != null && repackedBigBags != null) {
    if (repackedSmallBags < 0 || repackedBigBags < 0) {
      throw new Error('Bag counts cannot be negative');
    }
    if (!Number.isInteger(repackedSmallBags) || !Number.isInteger(repackedBigBags)) {
      throw new Error('Repacked bag counts must be whole numbers');
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
    smallMoved = repackedSmallBags;
    bigMoved = repackedBigBags;
  } else {
    smallMoved = sourceGrns.reduce((acc, s) => acc + (s.smallBags ?? 0), 0);
    bigMoved = sourceGrns.reduce((acc, s) => acc + (s.bigBags ?? 0), 0);
  }

  // 4. Final bag totals reconciliation check
  const finalSmall = targetGrn.smallBags + smallMoved;
  const finalBig = targetGrn.bigBags + bigMoved;
  const finalTotal = targetGrn.bags + totalMovedBags;

  if (finalSmall < 0 || finalBig < 0 || finalSmall + finalBig !== finalTotal) {
    throw new Error(
      `Final bag totals failed reconciliation: ${finalSmall}S + ${finalBig}B does not equal ${finalTotal} total bags`,
    );
  }

  return { smallMoved, bigMoved };
}

