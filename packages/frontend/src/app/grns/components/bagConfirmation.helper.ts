import {
  allocateHybridSplit,
  hasPositiveHybridRate,
  HYBRID_RATE_REQUIRED_MESSAGE,
  isHybridBagCategory,
  validateHybridQuantityInput,
  type OutwardBagCategory,
} from '@cold-storage/contracts';

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
  smallBags?: number | '';
  bigBags?: number | '';
  repackSmall: number | '';
  repackBig: number | '';
  totalMovedBags: number;
  isRepackRequired: boolean;
}

export function validateBagConfirmation(input: BagConfirmationInput): string | null {
  const { category, totalMovedBags } = input;

  if (isHybridBagCategory(category)) {
    const qtyErr = validateHybridQuantityInput(input.quantity, totalMovedBags, 'total moved stock');
    if (qtyErr) return qtyErr;
    if (!hasPositiveHybridRate(input)) return HYBRID_RATE_REQUIRED_MESSAGE;
    return null;
  }

  if (category === 'Small' || category === 'Big') {
    return 'Small-only and Big-only confirmation uses the Small & Big split (enter 0 for the unused side).';
  }

  if (typeof input.smallBags === 'number' || typeof input.bigBags === 'number') {
    const s = typeof input.smallBags === 'number' ? input.smallBags : 0;
    const b = typeof input.bigBags === 'number' ? input.bigBags : 0;
    if (s < 0 || b < 0) return 'Bag counts cannot be negative.';
    if (!Number.isInteger(s) || !Number.isInteger(b)) return 'Bag counts must be whole numbers.';
    if (s + b !== totalMovedBags) {
      return `Confirmed Small (${s}) and Big (${b}) bags must equal total moved bags (${totalMovedBags}).`;
    }
  }

  if (!input.isRepackRequired) {
    return null;
  }
  if (typeof input.repackSmall !== 'number' || typeof input.repackBig !== 'number') {
    return 'Both Small and Big bag counts must be confirmed.';
  }
  if (input.repackSmall < 0 || input.repackBig < 0) {
    return 'Bag counts cannot be negative.';
  }
  if (!Number.isInteger(input.repackSmall) || !Number.isInteger(input.repackBig)) {
    return 'Repacked bag counts must be whole numbers.';
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
  confirmedSmall?: number | ''; confirmedBig?: number | '';
}): { small: number; big: number } {
  if (isHybridBagCategory(input.category)) return allocateHybridPreview(input.rawSmall, input.rawBig, input.total);
  if (input.isRepackFilled) return { small: Number(input.repackSmall), big: Number(input.repackBig) };
  if (typeof input.confirmedSmall === 'number' && typeof input.confirmedBig === 'number') {
    return { small: input.confirmedSmall, big: input.confirmedBig };
  }
  return { small: input.defaultSmall, big: input.defaultBig };
}
