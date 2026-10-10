import {
  normalizeBagComposition,
  type BagType,
  type CorrectGrnInput,
} from '@cold-storage/contracts';

export interface StoredBagState {
  bagType: BagType;
  bags: number;
  smallBags: number;
  bigBags: number;
}

export interface BagEditResult {
  wantsBagsChange: boolean;
  finalBagType: BagType;
  finalBags: number;
  finalSmallBags: number;
  finalBigBags: number;
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
  update.bagType = finalBagType;
  update.bags = finalBags;
  update.smallBags = composition.smallBags;
  update.bigBags = composition.bigBags;
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
    update,
    inwardUpdate,
  };
}
