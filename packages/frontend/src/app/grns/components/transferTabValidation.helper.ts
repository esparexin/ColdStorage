import {
  hasPositiveHybridRate,
  HYBRID_RATE_REQUIRED_MESSAGE,
  isHybridBagCategory,
  validateHybridQuantityInput,
  type BagType,
  type OutwardBagCategory,
} from '@cold-storage/contracts';

export interface TransferConfirmationParams {
  isUnverified: boolean;
  remainingBags: number;
  confirmedSmallBags: number | '';
  confirmedBigBags: number | '';
  sourceBagType?: BagType;
  sourceBagCategory?: OutwardBagCategory | BagType | '';
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

export function validateTransferConfirmation(params: TransferConfirmationParams): string | null {
  const {
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

  const effectiveBagType = params.sourceBagType || sourceBagCategory;
  const isHybrid = effectiveBagType ? (effectiveBagType === 'Hybrid' || isHybridBagCategory(effectiveBagType)) : false;

  if (isHybrid) {
    const qty = sourceQuantity !== undefined && sourceQuantity !== null ? sourceQuantity : remainingBags;
    const qtyErr = validateHybridQuantityInput(qty, remainingBags, 'available stock');
    if (qtyErr) return qtyErr;
    if (!hasPositiveHybridRate({ bagPrice: sourceBagPrice, seasonalBagPrice: sourceSeasonalBagPrice, monthlyBagPrice: sourceMonthlyBagPrice })) {
      return HYBRID_RATE_REQUIRED_MESSAGE;
    }
    return null;
  }

  if (typeof confirmedSmallBags !== 'number' || typeof confirmedBigBags !== 'number') {
    return `Confirmed composition required for ${remainingBags} bags. Confirm Small + Big counts.`;
  }
  return validateBagReconciliation(confirmedSmallBags, confirmedBigBags, remainingBags);
}

