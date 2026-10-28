import {
  hasPositiveHybridRate,
  HYBRID_RATE_REQUIRED_MESSAGE,
  isHybridBagCategory,
  type Grn,
} from '@cold-storage/contracts';
import { deriveAutoInheritedBagComposition, type BagConfirmationValue } from './bagConfirmation.helper';

export interface Step2ValidationParams {
  targetGrnId: string;
  isTargetLoanHold: boolean;
  targetGrnNumber: string;
  targetCurrentRemaining: number;
  selectedSourceIds: string[];
}

export function validateStep2Proceed(params: Step2ValidationParams): string | null {
  const { targetGrnId, isTargetLoanHold, targetGrnNumber, targetCurrentRemaining, selectedSourceIds } = params;
  if (!targetGrnId) return 'Please select the surviving target GRN.';
  if (isTargetLoanHold) return `Target GRN '${targetGrnNumber}' has an active loan hold.`;
  if (targetCurrentRemaining <= 0) return `Target GRN '${targetGrnNumber}' has zero remaining stock.`;
  if (selectedSourceIds.length === 0) return 'Please select at least one source GRN to merge.';
  return null;
}

export interface Step3ValidationParams {
  selectedSources: Grn[];
  sourceConfirmations: Record<string, BagConfirmationValue>;
}

export function validateStep3Proceed(params: Step3ValidationParams): string | null {
  const { selectedSources, sourceConfirmations } = params;
  for (const s of selectedSources) {
    const conf = sourceConfirmations[s.id] ?? deriveAutoInheritedBagComposition([s], s.closingBags ?? s.bags);
    const bags = s.closingBags ?? s.bags;
    if (!isHybridBagCategory(conf.category)) {
      const sm = typeof conf.smallBags === 'number' ? conf.smallBags : 0;
      const bg = typeof conf.bigBags === 'number' ? conf.bigBags : 0;
      if (sm + bg !== bags) {
        return `Source GRN '${s.grnNumber}': Confirmed Small (${sm}) and Big (${bg}) bags must equal ${bags} bags.`;
      }
    } else if ((typeof conf.quantity === 'number' ? conf.quantity : 0) !== bags) {
      return `Source GRN '${s.grnNumber}': Hybrid bags must match ${bags} bags.`;
    }
  }
  return null;
}

export interface MergeSubmitValidationParams {
  selectedSourceIds: string[];
  reason: string;
  isTargetLoanHold: boolean;
  targetGrnNumber: string;
  repackMode: boolean;
  repackBagType: 'S/B' | 'Hybrid';
  isRepackFilled: boolean;
  repackSmall: number | '';
  repackBig: number | '';
  repackQuantity: number | '';
  repackBagPrice: number | '';
  repackSeasonalBagPrice: number | '';
  repackMonthlyBagPrice: number | '';
}

export function validateMergeSubmit(params: MergeSubmitValidationParams): string | null {
  const {
    selectedSourceIds, reason, isTargetLoanHold, targetGrnNumber,
    repackMode, repackBagType, isRepackFilled, repackSmall, repackBig,
    repackQuantity, repackBagPrice, repackSeasonalBagPrice, repackMonthlyBagPrice,
  } = params;

  if (selectedSourceIds.length === 0) return 'Select at least one source GRN to merge.';
  if (reason.trim().length < 5) return 'Audit reason must be at least 5 characters.';
  if (isTargetLoanHold) return `Target GRN '${targetGrnNumber}' has an active loan hold.`;

  if (repackMode) {
    if (repackBagType === 'S/B') {
      if (!isRepackFilled || Number(repackSmall) < 0 || Number(repackBig) < 0) {
        return 'Both Repacked Small and Big bag counts are required.';
      }
    } else {
      if (!isRepackFilled || Number(repackQuantity) <= 0) {
        return 'Repacked Hybrid bag count is required and must be greater than zero.';
      }
      const hasRate = hasPositiveHybridRate({
        bagPrice: typeof repackBagPrice === 'number' ? repackBagPrice : undefined,
        seasonalBagPrice: typeof repackSeasonalBagPrice === 'number' ? repackSeasonalBagPrice : undefined,
        monthlyBagPrice: typeof repackMonthlyBagPrice === 'number' ? repackMonthlyBagPrice : undefined,
      });
      if (!hasRate) return HYBRID_RATE_REQUIRED_MESSAGE;
    }
  }

  return null;
}
