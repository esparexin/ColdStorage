import {
  allocateHybridSplit,
  hasPositiveHybridRate,
  isHybridBagCategory,
  resolveStoredCompositionVerified,
  seasonYearForInwardDate,
  validateHybridQuantityInput,
  type BagType,
  type OutwardBagCategory,
} from '@cold-storage/contracts';
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
    isCompositionVerified?: boolean | null;
  };
  sourceGrns: MergeSourceGrn[];
  repackedSmallBags?: number | null;
  repackedBigBags?: number | null;
  repackedBagCount?: number | null;
  // Source bag type / category confirmation (outward vocabulary). Small/Big/Small & Big
  // resolve through the same composition rules as inward receipts; Hybrid-family
  // values (Hybrid, Mixed, Modern…) take a quantity plus informational rates.
  sourceBagType?: BagType | null;
  sourceBagCategory?: OutwardBagCategory | null;
  sourceQuantity?: number | null;
  sourceBagPrice?: number | null;
  sourceSeasonalBagPrice?: number | null;
  sourceMonthlyBagPrice?: number | null;
  totalMovedBags: number;
  defaultSmallMoved?: number;
  defaultBigMoved?: number;
  movementDate: Date;
  isRepackSelected?: boolean;
}

export interface ValidatedMergeRepackedResult {
  smallMoved: number;
  bigMoved: number;
  actualMovedBags: number;
  repackVariance: number;
  repackSourceBags: number;
  explicitConfirmation: boolean;
}

export function validateMergeRepackedCounts(params: ValidateMergeRepackedParams): ValidatedMergeRepackedResult {
  const { targetGrn, sourceGrns, repackedSmallBags, repackedBigBags, totalMovedBags, movementDate } = params;
  const { sourceBagType, sourceBagCategory, sourceQuantity, sourceBagPrice, sourceSeasonalBagPrice, sourceMonthlyBagPrice } = params;
  const effectiveCategory = sourceBagType ?? sourceBagCategory;

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

  // 3. Explicit stored flag preferred: any unverified lot requires confirmation,
  // even when rates are equal — uniform `{bags, 0}` placeholders must not propagate silently.
  const isTargetVerified = resolveStoredCompositionVerified(targetGrn);
  const hasUnverifiedSource = sourceGrns.some(
    (s) =>
      !resolveStoredCompositionVerified({
        isCompositionVerified: (s as unknown as Record<string, unknown>).isCompositionVerified as boolean | null ?? null,
        bagType: s.bagType,
        bags: s.bags,
        smallBags: s.smallBags,
        bigBags: s.bigBags,
      }),
  );
  const requiresComposition = !isTargetVerified || hasUnverifiedSource;

  if (requiresComposition && (repackedSmallBags == null || repackedBigBags == null) && !(effectiveCategory != null && (effectiveCategory === 'Hybrid' || isHybridBagCategory(effectiveCategory)))) {
    throw new Error(
      'Confirmed small and big bag counts are required when merging lots with unverified composition',
    );
  }

  let smallMoved = 0;
  let bigMoved = 0;
  let actualMovedBags: number;

  if (effectiveCategory === 'Small' || effectiveCategory === 'Big' || effectiveCategory === 'S' || effectiveCategory === 'B') {
    // No separate single-type options: Small-only and Big-only are expressed
    // through the Small & Big split with 0 on the unused side (outward parity).
    throw new Error('Small-only and Big-only confirmation uses the Small & Big split (enter 0 for the unused side)');
  }

  if (effectiveCategory != null && (effectiveCategory === 'Hybrid' || isHybridBagCategory(effectiveCategory))) {
    // Hybrid-family confirmation (Hybrid, Mixed, Modern…): quantity plus
    // informational rates, mirroring outward Hybrid validation. Rates never
    // feed rent; the split below serves ledger accounting only.
    if (!params.isRepackSelected) {
      const qtyErr = validateHybridQuantityInput(sourceQuantity, totalMovedBags, 'total moved stock');
      if (qtyErr) {
        if (qtyErr.includes('must match')) {
          throw new Error(`Confirmed Hybrid quantity (${sourceQuantity}) must match total moved stock of ${totalMovedBags} bags`);
        }
        throw new Error('Confirmed Hybrid quantity must be a positive whole number');
      }
      actualMovedBags = totalMovedBags;
    } else {
      const hybridQty = sourceQuantity ?? params.repackedBagCount;
      if (typeof hybridQty !== 'number' || !Number.isInteger(hybridQty) || hybridQty <= 0) {
        throw new Error('Repacked Hybrid bag count must be a positive whole number');
      }
      actualMovedBags = hybridQty;
    }
    if (!hasPositiveHybridRate({
      bagPrice: sourceBagPrice,
      seasonalBagPrice: sourceSeasonalBagPrice,
      monthlyBagPrice: sourceMonthlyBagPrice,
    })) {
      throw new Error('Confirmed Hybrid lots require a per-bag rate (Each Bag Price, or Seasonal/Monthly rates)');
    }
    const ledSmall = params.defaultSmallMoved ?? sourceGrns.reduce((acc, s) => acc + (s.smallBags ?? 0), 0);
    const ledBig = params.defaultBigMoved ?? sourceGrns.reduce((acc, s) => acc + (s.bigBags ?? 0), 0);
    // Shared outward allocator: fill Small first, remainder to Big.
    const split = allocateHybridSplit(ledSmall, ledBig, actualMovedBags);
    smallMoved = split.smallBags;
    bigMoved = split.bigBags;
  } else if (repackedSmallBags != null && repackedBigBags != null) {
    if (repackedSmallBags < 0 || repackedBigBags < 0) {
      throw new Error('Bag counts cannot be negative');
    }
    if (!Number.isInteger(repackedSmallBags) || !Number.isInteger(repackedBigBags)) {
      throw new Error('Repacked bag counts must be whole numbers');
    }
    actualMovedBags = repackedSmallBags + repackedBigBags;
    if (actualMovedBags <= 0) {
      throw new Error('Confirmed repacked bag counts must be greater than zero');
    }
    if (!params.isRepackSelected && actualMovedBags > totalMovedBags) {
      throw new Error(`Confirmed outward bag quantity (${actualMovedBags}) cannot exceed Total Bags (${totalMovedBags})`);
    }
    if (!params.isRepackSelected && actualMovedBags !== totalMovedBags) {
      throw new Error(`Confirmed Small (${repackedSmallBags}) and Big (${repackedBigBags}) bags must equal Total Bags (${totalMovedBags})`);
    }
    // Decoupled from previous counts: operator confirms physical resulting counts
    smallMoved = repackedSmallBags;
    bigMoved = repackedBigBags;
  } else {
    smallMoved = params.defaultSmallMoved ?? sourceGrns.reduce((acc, s) => acc + (s.smallBags ?? 0), 0);
    bigMoved = params.defaultBigMoved ?? sourceGrns.reduce((acc, s) => acc + (s.bigBags ?? 0), 0);
    actualMovedBags = totalMovedBags;
  }

  const repackVariance = actualMovedBags - totalMovedBags;

  // 4. Final bag totals reconciliation check
  const baseTargetSmall = targetGrn.isCompositionVerified ? targetGrn.smallBags : targetGrn.bags;
  const baseTargetBig = targetGrn.isCompositionVerified ? targetGrn.bigBags : 0;
  const finalSmall = baseTargetSmall + smallMoved;
  const finalBig = baseTargetBig + bigMoved;
  const finalTotal = targetGrn.bags + actualMovedBags;

  if (finalSmall < 0 || finalBig < 0 || finalSmall + finalBig !== finalTotal) {
    throw new Error(
      `Final bag totals failed reconciliation: ${finalSmall}S + ${finalBig}B does not equal ${finalTotal} total bags`,
    );
  }

  const explicitConfirmation =
    (effectiveCategory != null && (effectiveCategory === 'Hybrid' || isHybridBagCategory(effectiveCategory))) ||
    (repackedSmallBags != null && repackedBigBags != null);
  return {
    smallMoved,
    bigMoved,
    actualMovedBags,
    repackVariance,
    repackSourceBags: totalMovedBags,
    explicitConfirmation,
  };
}

