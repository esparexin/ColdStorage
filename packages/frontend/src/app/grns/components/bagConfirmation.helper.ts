import { allocateHybridSplit, isHybridBagCategory, type OutwardBagCategory } from '@cold-storage/contracts';

/**
 * bagConfirmation.helper — pure validation for the Internal Move source
 * bag-category confirmation. Mirrors the outward Hybrid/S/B validation
 * patterns and the backend merge validator messages; the backend remains
 * authoritative at execution time.
 */
export interface BagConfirmationInput {
  category: OutwardBagCategory;
  quantity: number | '';
  bagPrice: number | '';
  seasonalBagPrice: number | '';
  monthlyBagPrice: number | '';
  repackSmall: number | '';
  repackBig: number | '';
  totalMovedBags: number;
  isRepackRequired: boolean;
}

export function validateBagConfirmation(input: BagConfirmationInput): string | null {
  const { category, totalMovedBags } = input;

  if (isHybridBagCategory(category)) {
    if (typeof input.quantity !== 'number' || !Number.isInteger(input.quantity) || input.quantity <= 0) {
      return 'Confirmed Hybrid quantity must be a positive whole number.';
    }
    if (input.quantity !== totalMovedBags) {
      return `Confirmed Hybrid quantity (${input.quantity}) must match total moved stock of ${totalMovedBags} bags.`;
    }
    const hasRate =
      (typeof input.bagPrice === 'number' && input.bagPrice > 0) ||
      (typeof input.seasonalBagPrice === 'number' && input.seasonalBagPrice > 0) ||
      (typeof input.monthlyBagPrice === 'number' && input.monthlyBagPrice > 0);
    if (!hasRate) {
      return 'Confirmed Hybrid lots require a per-bag rate (Each Bag Price, or Seasonal/Monthly rates).';
    }
    return null;
  }

  if (category === 'Small' || category === 'Big') {
    // No separate single-type options: Small-only and Big-only are expressed
    // through the Small & Big split with 0 on the unused side (outward parity).
    return 'Small-only and Big-only confirmation uses the Small & Big split (enter 0 for the unused side).';
  }

  if (!input.isRepackRequired) {
    return null;
  }
  if (typeof input.repackSmall !== 'number' || typeof input.repackBig !== 'number') {
    return 'Both Small and Big bag counts must be confirmed. Combined total must match available bags.';
  }
  if (input.repackSmall > totalMovedBags || input.repackBig > totalMovedBags) {
    return `Neither Small nor Big bag counts can exceed available total (${totalMovedBags} bags).`;
  }
  if (input.repackSmall + input.repackBig !== totalMovedBags) {
    return `Counts (${input.repackSmall}S + ${input.repackBig}B = ${input.repackSmall + input.repackBig}) must match total available (${totalMovedBags} bags).`;
  }
  return null;
}

/**
 * Preview split for Hybrid confirmations. Delegates to the shared SSOT
 * allocator (same algorithm as Outward Delivery and the merge backend);
 * the backend allocator is authoritative at execution.
 */
export function allocateHybridPreview(ledgerSmall: number, ledgerBig: number, total: number): { small: number; big: number } {
  const split = allocateHybridSplit(ledgerSmall, ledgerBig, total);
  return { small: split.smallBags, big: split.bigBags };
}

/**
 * Review-strip preview for a confirmed category. Single-type categories imply
 * their split; Hybrid previews the ledger-proportion allocation; otherwise the
 * confirmed repacked split or the ledger defaults apply.
 */
export function previewConfirmedSplit(input: {
  category: OutwardBagCategory; rawSmall: number; rawBig: number; total: number;
  defaultSmall: number; defaultBig: number; repackSmall: number | ''; repackBig: number | ''; isRepackFilled: boolean;
}): { small: number; big: number } {
  if (isHybridBagCategory(input.category)) return allocateHybridPreview(input.rawSmall, input.rawBig, input.total);
  if (input.isRepackFilled) return { small: Number(input.repackSmall), big: Number(input.repackBig) };
  return { small: input.defaultSmall, big: input.defaultBig };
}
