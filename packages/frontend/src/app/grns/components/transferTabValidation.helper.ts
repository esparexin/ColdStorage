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

  const isHybrid = sourceBagCategory ? isHybridBagCategory(sourceBagCategory) : false;

  if (isHybrid) {
    const qtyErr = validateHybridQuantityInput(sourceQuantity, remainingBags, 'available stock');
    if (qtyErr) return qtyErr;
    if (!hasPositiveHybridRate({ bagPrice: sourceBagPrice, seasonalBagPrice: sourceSeasonalBagPrice, monthlyBagPrice: sourceMonthlyBagPrice })) {
      return HYBRID_RATE_REQUIRED_MESSAGE;
    }
    return null;
  }

  if (!isUnverified) return null;
  if (typeof confirmedSmallBags !== 'number' || typeof confirmedBigBags !== 'number') {
    return `Confirmed composition required for unverified GRN (${remainingBags} bags). Confirm Small + Big counts.`;
  }
  if (confirmedSmallBags + confirmedBigBags !== remainingBags) {
    return `Confirmed counts (${confirmedSmallBags} + ${confirmedBigBags}) must equal stock of ${remainingBags} bags.`;
  }
  return null;
}

