import {
  hasPositiveHybridRate,
  HYBRID_RATE_REQUIRED_MESSAGE,
  isHybridBagCategory,
  validateHybridQuantityInput,
  type OutwardBagCategory,
} from '@cold-storage/contracts';

export interface TransferConfirmationParams {
  isUnverified: boolean;
  remainingBags: number;
  confirmedSmallBags: number | '';
  confirmedBigBags: number | '';
  sourceBagCategory?: OutwardBagCategory | '';
  sourceQuantity?: number | '';
  sourceBagPrice?: number | '';
  sourceSeasonalBagPrice?: number | '';
  sourceMonthlyBagPrice?: number | '';
}

function validateBagReconciliation(s: number, b: number, remaining: number): string | null {
  if (!Number.isInteger(s) || !Number.isInteger(b) || s < 0 || b < 0) {
    return 'Confirmed bag counts must be whole non-negative numbers.';
  }
  if (s + b > remaining) {
    return `Confirmed counts (${s} + ${b}) cannot exceed remaining stock of ${remaining} bags.`;
  }
  if (s + b !== remaining) {
    return `Confirmed counts (${s} + ${b}) must equal stock of ${remaining} bags.`;
  }
  return null;
}

export function validateTransferConfirmation(
  paramsOrIsUnverified: TransferConfirmationParams | boolean,
  legacyRemainingBags?: number,
  legacyConfirmedSmall?: number | '',
  legacyConfirmedBig?: number | '',
): string | null {
  const params: TransferConfirmationParams =
    typeof paramsOrIsUnverified === 'boolean'
      ? {
          isUnverified: paramsOrIsUnverified,
          remainingBags: legacyRemainingBags ?? 0,
          confirmedSmallBags: legacyConfirmedSmall ?? '',
          confirmedBigBags: legacyConfirmedBig ?? '',
        }
      : paramsOrIsUnverified;

  const {
    isUnverified,
    remainingBags,
    confirmedSmallBags,
    confirmedBigBags,
    sourceBagCategory,
    sourceQuantity,
    sourceBagPrice,
    sourceSeasonalBagPrice,
    sourceMonthlyBagPrice,
  } = params;

  if (remainingBags <= 0) {
    return 'Cannot transfer ownership: No stock remaining in this GRN.';
  }

  const isHybrid = sourceBagCategory ? isHybridBagCategory(sourceBagCategory) : false;

  if (isHybrid) {
    const qty = sourceQuantity !== undefined && sourceQuantity !== null ? sourceQuantity : remainingBags;
    const qtyErr = validateHybridQuantityInput(qty, remainingBags, 'available stock');
    if (qtyErr) return qtyErr;
    if (!hasPositiveHybridRate({ bagPrice: sourceBagPrice, seasonalBagPrice: sourceSeasonalBagPrice, monthlyBagPrice: sourceMonthlyBagPrice })) {
      return HYBRID_RATE_REQUIRED_MESSAGE;
    }
    return null;
  }

  if (!isUnverified) {
    if (typeof confirmedSmallBags === 'number' || typeof confirmedBigBags === 'number') {
      const s = typeof confirmedSmallBags === 'number' ? confirmedSmallBags : 0;
      const b = typeof confirmedBigBags === 'number' ? confirmedBigBags : 0;
      return validateBagReconciliation(s, b, remainingBags);
    }
    return null;
  }

  if (typeof confirmedSmallBags !== 'number' || typeof confirmedBigBags !== 'number') {
    return `Confirmed composition required for unverified GRN (${remainingBags} bags). Confirm Small + Big counts.`;
  }
  return validateBagReconciliation(confirmedSmallBags, confirmedBigBags, remainingBags);
}

