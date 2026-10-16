import { isHybridBagCategory, type OutwardBagCategory } from '@cold-storage/contracts';

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
    if (typeof sourceQuantity !== 'number' || !Number.isInteger(sourceQuantity) || sourceQuantity <= 0) {
      return 'Confirmed Hybrid quantity must be a positive whole number.';
    }
    if (sourceQuantity !== remainingBags) {
      return `Confirmed Hybrid quantity (${sourceQuantity}) must match available stock of ${remainingBags} bags.`;
    }
    const hasRate =
      (typeof sourceBagPrice === 'number' && sourceBagPrice > 0) ||
      (typeof sourceSeasonalBagPrice === 'number' && sourceSeasonalBagPrice > 0) ||
      (typeof sourceMonthlyBagPrice === 'number' && sourceMonthlyBagPrice > 0);
    if (!hasRate) {
      return 'Confirmed Hybrid lots require a per-bag rate (Each Bag Price, or Seasonal/Monthly rates).';
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

