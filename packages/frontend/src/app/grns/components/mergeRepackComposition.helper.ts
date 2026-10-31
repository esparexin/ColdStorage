import {
  allocateHybridSplit,
  isHybridBagCategory,
  resolveStoredCompositionVerified,
  type Grn,
  type OperationalBagType,
} from '@cold-storage/contracts';
import type { BagConfirmationValue } from './bagConfirmation.helper';

export interface RepackCompositionStatusParams {
  targetGrn: Grn;
  selectedSources: Grn[];
  repackMode: boolean;
  repackBagType: OperationalBagType;
  repackQuantity: number | '';
  repackSmall: number | '';
  repackBig: number | '';
}

export interface RepackCompositionStatus {
  isTargetDiff: boolean;
  isTargetVerified: boolean;
  allSourcesVerified: boolean;
  isRepackRequired: boolean;
  isRepackFilled: boolean;
  actualRepackedBags: number;
}

export function deriveRepackCompositionStatus(
  params: RepackCompositionStatusParams,
): RepackCompositionStatus {
  const { targetGrn, selectedSources, repackMode, repackBagType, repackQuantity, repackSmall, repackBig } = params;

  const isTargetDiff =
    (targetGrn.smallBagPrice != null || targetGrn.bigBagPrice != null) &&
    targetGrn.smallBagPrice !== targetGrn.bigBagPrice;

  const isTargetVerified = resolveStoredCompositionVerified({
    isCompositionVerified: targetGrn.isCompositionVerified,
    bagType: targetGrn.bagType,
    bags: targetGrn.bags,
    smallBags: targetGrn.smallBags,
    bigBags: targetGrn.bigBags,
  });

  const allSourcesVerified = selectedSources.every((s) =>
    resolveStoredCompositionVerified({
      isCompositionVerified: s.isCompositionVerified,
      bagType: s.bagType,
      bags: s.bags,
      smallBags: s.smallBags,
      bigBags: s.bigBags,
    }),
  );

  const isRepackRequired =
    repackMode ||
    (selectedSources.length > 0 &&
      (isTargetDiff ||
        selectedSources.some(
          (s) =>
            (s.smallBagPrice != null || s.bigBagPrice != null) &&
            s.smallBagPrice !== s.bigBagPrice,
        )) &&
      (!isTargetVerified || !allSourcesVerified));

  const isRepackFilled =
    repackBagType === 'Hybrid'
      ? typeof repackQuantity === 'number' && Number.isInteger(repackQuantity) && repackQuantity > 0
      : typeof repackSmall === 'number' &&
        typeof repackBig === 'number' &&
        Number.isInteger(repackSmall) &&
        Number.isInteger(repackBig) &&
        repackSmall >= 0 &&
        repackBig >= 0 &&
        repackSmall + repackBig > 0;

  const actualRepackedBags =
    repackMode && isRepackFilled
      ? repackBagType === 'Hybrid'
        ? Number(repackQuantity)
        : Number(repackSmall) + Number(repackBig)
      : 0;

  return {
    isTargetDiff,
    isTargetVerified,
    allSourcesVerified,
    isRepackRequired,
    isRepackFilled,
    actualRepackedBags,
  };
}

export interface MovedAndTargetBagsParams {
  selectedSources: Grn[];
  sourceConfirmations: Record<string, BagConfirmationValue>;
  repackMode: boolean;
  repackBagType: OperationalBagType;
  isRepackFilled: boolean;
  repackSmall: number | '';
  repackBig: number | '';
  repackQuantity: number | '';
  totalSourceBags: number;
  targetCurrentRemaining: number;
  targetBagType?: string | null;
  actualRepackedBags: number;
}

export function deriveMovedAndTargetBags(params: MovedAndTargetBagsParams) {
  const {
    selectedSources, sourceConfirmations, repackMode, repackBagType, isRepackFilled,
    repackSmall, repackBig, repackQuantity, totalSourceBags, targetCurrentRemaining,
    targetBagType, actualRepackedBags,
  } = params;

  const confSmall = selectedSources.reduce((acc, s) => {
    const c = sourceConfirmations[s.id];
    if (c && isHybridBagCategory(c.category)) return acc;
    return acc + (c && typeof c.smallBags === 'number' ? c.smallBags : (s.smallBags ?? (s.closingBags ?? s.bags)));
  }, 0);

  const confBig = selectedSources.reduce((acc, s) => {
    const c = sourceConfirmations[s.id];
    if (c && isHybridBagCategory(c.category)) return acc;
    return acc + (c && typeof c.bigBags === 'number' ? c.bigBags : (s.bigBags ?? 0));
  }, 0);

  const repackedHybridSplit = allocateHybridSplit(
    confSmall,
    confBig,
    typeof repackQuantity === 'number' ? repackQuantity : totalSourceBags,
  );

  const movedSmall =
    repackMode && isRepackFilled
      ? repackBagType === 'Hybrid'
        ? repackedHybridSplit.smallBags
        : Number(repackSmall)
      : confSmall;

  const movedBig =
    repackMode && isRepackFilled
      ? repackBagType === 'Hybrid'
        ? repackedHybridSplit.bigBags
        : Number(repackBig)
      : confBig;

  const addedBagsToTarget = repackMode ? (isRepackFilled ? actualRepackedBags : 0) : totalSourceBags;
  const targetNewRemaining = targetCurrentRemaining + addedBagsToTarget;

  const anySourceHybrid = selectedSources.some((s) => isHybridBagCategory(sourceConfirmations[s.id]?.category));
  const effectiveIsHybrid = repackMode
    ? repackBagType === 'Hybrid'
    : anySourceHybrid || isHybridBagCategory(targetBagType);

  return {
    confSmall,
    confBig,
    repackedHybridSplit,
    movedSmall,
    movedBig,
    addedBagsToTarget,
    targetNewRemaining,
    effectiveIsHybrid,
  };
}
