import type { OperationalBagType, OutwardBagCategory } from '@cold-storage/contracts';
import { isHybridBagCategory } from '@cold-storage/contracts';
import type { BagConfirmationValue } from './bagConfirmation.helper';

export interface MergeExecutionPayloadParams {
  repackMode: boolean;
  repackBagType: OperationalBagType;
  repackSmall: number | '';
  repackBig: number | '';
  repackQuantity: number | '';
  repackBagPrice: number | '';
  repackSeasonalBagPrice: number | '';
  repackMonthlyBagPrice: number | '';
  isRepackFilled: boolean;
  isRepackRequired: boolean;
  movedSmall: number;
  movedBig: number;
  totalSourceBags: number;
  primaryConf: BagConfirmationValue;
}

export function buildMergeExecutionPayload(params: MergeExecutionPayloadParams) {
  const {
    repackMode, repackBagType, repackSmall, repackBig, repackQuantity,
    repackBagPrice, repackSeasonalBagPrice, repackMonthlyBagPrice,
    isRepackFilled, isRepackRequired, movedSmall, movedBig, totalSourceBags, primaryConf,
  } = params;

  const isSb =
    (!repackMode && (primaryConf.category === 'S/B' || primaryConf.category === 'Small & Big')) ||
    (repackMode && repackBagType === 'S/B');

  const effSmall = repackMode
    ? repackBagType === 'Hybrid' ? movedSmall : Number(repackSmall)
    : isRepackFilled
      ? Number(repackSmall)
      : typeof primaryConf.smallBags === 'number' ? primaryConf.smallBags : undefined;

  const effBig = repackMode
    ? repackBagType === 'Hybrid' ? movedBig : Number(repackBig)
    : isRepackFilled
      ? Number(repackBig)
      : typeof primaryConf.bigBags === 'number' ? primaryConf.bigBags : undefined;

  const effQuantity = repackMode
    ? repackBagType === 'Hybrid' ? Number(repackQuantity) : undefined
    : isHybridBagCategory(primaryConf.category)
      ? totalSourceBags
      : typeof primaryConf.quantity === 'number' ? primaryConf.quantity : undefined;

  const effBagPrice = repackMode
    ? typeof repackBagPrice === 'number' ? repackBagPrice : undefined
    : typeof primaryConf.bagPrice === 'number' ? primaryConf.bagPrice : undefined;

  const effSeasonalPrice = repackMode
    ? typeof repackSeasonalBagPrice === 'number' ? repackSeasonalBagPrice : undefined
    : typeof primaryConf.seasonalBagPrice === 'number' ? primaryConf.seasonalBagPrice : undefined;

  const effMonthlyPrice = repackMode
    ? typeof repackMonthlyBagPrice === 'number' ? repackMonthlyBagPrice : undefined
    : typeof primaryConf.monthlyBagPrice === 'number' ? primaryConf.monthlyBagPrice : undefined;

  const effRepackedBagCount =
    repackMode && isRepackFilled
      ? repackBagType === 'Hybrid' ? Number(repackQuantity) : Number(repackSmall) + Number(repackBig)
      : undefined;

  const resolvedCategory: OutwardBagCategory | undefined = repackMode
    ? repackBagType
    : !isSb || isRepackRequired || isRepackFilled || typeof primaryConf.smallBags === 'number'
      ? primaryConf.category
      : undefined;

  return {
    effSmall,
    effBig,
    effQuantity,
    effBagPrice,
    effSeasonalPrice,
    effMonthlyPrice,
    effRepackedBagCount,
    resolvedCategory,
  };
}
