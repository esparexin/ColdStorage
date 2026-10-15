import {
  isBagCompositionVerified,
  normalizeBagComposition,
  type BagType,
  type CorrectGrnInput,
} from '@cold-storage/contracts';

export interface StoredBagState {
  bagType: BagType;
  bags: number;
  smallBags: number;
  bigBags: number;
  isCompositionVerified?: boolean | null;
}

export interface BagEditResult {
  wantsBagsChange: boolean;
  finalBagType: BagType;
  finalBags: number;
  finalSmallBags: number;
  finalBigBags: number;
  finalIsCompositionVerified?: boolean;
  update: Record<string, unknown>;
  inwardUpdate: Record<string, unknown>;
}

export function wantsBagsChange(input: CorrectGrnInput): boolean {
  return (
    input.bagType !== undefined ||
    input.bags !== undefined ||
    input.smallBags !== undefined ||
    input.bigBags !== undefined
  );
}

/**
 * Resolves a bag-type/count edit into stored fields plus ledger mirrors.
 *
 * A single-type receipt's composition follows its bag type; a mixed receipt's corrected
 * split must sum to the corrected total. The shared normalizer rejects anything else.
 * When only a mixed total changes without an explicit split, the single-side
 * convention from the normalizer applies rather than an invented division.
 */
export function resolveBagEdit(input: CorrectGrnInput, grn: StoredBagState): BagEditResult {
  const update: Record<string, unknown> = {};
  const inwardUpdate: Record<string, unknown> = {};
  let finalBagType = grn.bagType;
  let finalBags = grn.bags;
  let finalSmallBags = grn.smallBags;
  let finalBigBags = grn.bigBags;

  if (!wantsBagsChange(input)) {
    return {
      wantsBagsChange: false,
      finalBagType,
      finalBags,
      finalSmallBags,
      finalBigBags,
      finalIsCompositionVerified: grn.isCompositionVerified ?? undefined,
      update,
      inwardUpdate,
    };
  }

  finalBagType = input.bagType ?? grn.bagType;
  finalBags = input.bags ?? grn.bags;
  const composition = normalizeBagComposition({
    bagType: finalBagType,
    bags: finalBags,
    smallBags:
      input.smallBags ??
      (finalBagType === 'S+B' ? (input.bags !== undefined ? undefined : grn.smallBags) : undefined),
    bigBags:
      input.bigBags ??
      (finalBagType === 'S+B' ? (input.bags !== undefined ? undefined : grn.bigBags) : undefined),
  });
  let finalIsCompositionVerified: boolean;
  if (input.smallBags !== undefined || input.bigBags !== undefined) {
    finalIsCompositionVerified = isBagCompositionVerified({
      bagType: finalBagType,
      bags: finalBags,
      smallBags: input.smallBags ?? null,
      bigBags: input.bigBags ?? null,
    });
  } else if (finalBagType === 'S' || finalBagType === 'B') {
    finalIsCompositionVerified = true;
  } else if (input.bags !== undefined || input.bagType !== undefined) {
    finalIsCompositionVerified = false;
  } else {
    finalIsCompositionVerified = grn.isCompositionVerified ?? true;
  }
  update.bagType = finalBagType;
  update.bags = finalBags;
  update.smallBags = composition.smallBags;
  update.bigBags = composition.bigBags;
  update.isCompositionVerified = finalIsCompositionVerified;
  inwardUpdate.bagType = finalBagType;
  inwardUpdate.smallQuantity = composition.smallBags;
  inwardUpdate.bigQuantity = composition.bigBags;
  finalSmallBags = composition.smallBags;
  finalBigBags = composition.bigBags;
  // Per-bag weights are independent of the bag count, so a corrected count
  // does not invalidate or recalculate any weight field.

  return {
    wantsBagsChange: true,
    finalBagType,
    finalBags,
    finalSmallBags,
    finalBigBags,
    finalIsCompositionVerified,
    update,
    inwardUpdate,
  };
}
