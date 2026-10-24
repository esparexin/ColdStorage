import {
  allocateHybridSplit,
  hasPositiveHybridRate,
  HYBRID_RATE_REQUIRED_MESSAGE,
  isHybridBagCategory,
  resolveStoredCompositionVerified,
  validateHybridQuantityInput,
  type BagType,
  type Grn,
  type OutwardBagCategory,
} from '@cold-storage/contracts';

export interface BagConfirmationValue {
  category: OutwardBagCategory;
  quantity: number | '';
  bagPrice: number | '';
  seasonalBagPrice: number | '';
  monthlyBagPrice: number | '';
  smallBags?: number | '';
  bigBags?: number | '';
  confirmedSmallBags?: number | '';
  confirmedBigBags?: number | '';
}

export const DEFAULT_BAG_CONFIRMATION: BagConfirmationValue = {
  category: 'S/B',
  quantity: '',
  bagPrice: '',
  seasonalBagPrice: '',
  monthlyBagPrice: '',
  smallBags: '',
  bigBags: '',
};
export interface BagConfirmationInput {
  category?: OutwardBagCategory | BagType;
  bagType?: BagType;
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
  const category = input.bagType ?? input.category;
  const { totalMovedBags } = input;

  if (typeof input.quantity === 'number' && input.quantity > totalMovedBags) {
    return `Outward confirmed quantity (${input.quantity}) cannot exceed Total Bags of ${totalMovedBags}.`;
  }

  if (isHybridBagCategory(category)) {
    const qtyErr = validateHybridQuantityInput(input.quantity, totalMovedBags, 'total moved stock');
    if (qtyErr) return qtyErr;
    if (!hasPositiveHybridRate(input)) return HYBRID_RATE_REQUIRED_MESSAGE;
    return null;
  }

  if (category === 'Small' || category === 'Big' || category === 'S' || category === 'B') {
    return 'Small-only and Big-only confirmation uses the Small & Big split (enter 0 for the unused side).';
  }

  if (typeof input.smallBags === 'number' || typeof input.bigBags === 'number') {
    const s = typeof input.smallBags === 'number' ? input.smallBags : 0;
    const b = typeof input.bigBags === 'number' ? input.bigBags : 0;
    if (s < 0 || b < 0) return 'Bag counts cannot be negative.';
    if (!Number.isInteger(s) || !Number.isInteger(b)) return 'Bag counts must be whole numbers.';
    if (s + b > totalMovedBags) {
      return `Outward confirmed quantity (${s + b}) cannot exceed Total Bags of ${totalMovedBags}.`;
    }
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
  category?: OutwardBagCategory | BagType;
  bagType?: BagType;
  rawSmall: number;
  rawBig: number;
  total: number;
  defaultSmall: number;
  defaultBig: number;
  repackSmall: number | '';
  repackBig: number | '';
  isRepackFilled: boolean;
  confirmedSmall?: number | '';
  confirmedBig?: number | '';
}): { small: number; big: number } {
  const category = input.bagType ?? input.category;
  if (isHybridBagCategory(category)) return allocateHybridPreview(input.rawSmall, input.rawBig, input.total);
  if (input.isRepackFilled) return { small: Number(input.repackSmall), big: Number(input.repackBig) };
  if (typeof input.confirmedSmall === 'number' && typeof input.confirmedBig === 'number') {
    return { small: input.confirmedSmall, big: input.confirmedBig };
  }
  return { small: input.defaultSmall, big: input.defaultBig };
}

/**
 * Auto-inherits source bag composition directly from selected source GRN(s),
 * preserving SSOT and ledger state without requiring manual operator re-entry.
 */
export function deriveAutoInheritedBagComposition(
  selectedSources: Grn[],
  totalSourceBags: number,
): BagConfirmationValue {
  if (selectedSources.length === 0 || totalSourceBags <= 0) {
    return { ...DEFAULT_BAG_CONFIRMATION, quantity: totalSourceBags };
  }

  const isAnyHybrid = selectedSources.some(
    (s) => s.bagType === 'Hybrid' || isHybridBagCategory(s.bagType),
  );

  if (isAnyHybrid) {
    const firstHybrid = selectedSources.find(
      (s) => s.bagType === 'Hybrid' || isHybridBagCategory(s.bagType),
    );
    const rate = firstHybrid?.bagPrice ?? selectedSources[0]?.bagPrice ?? '';
    return {
      category: 'Hybrid',
      quantity: totalSourceBags,
      smallBags: totalSourceBags,
      bigBags: 0,
      confirmedSmallBags: totalSourceBags,
      confirmedBigBags: 0,
      seasonalBagPrice: rate,
      monthlyBagPrice: '',
      bagPrice: rate,
    };
  }

  let totalDerivedSmall = 0;
  let totalDerivedBig = 0;

  for (const s of selectedSources) {
    const sourceBags = s.closingBags ?? s.bags;
    const isVer = resolveStoredCompositionVerified(s);
    if (isVer && ((s.smallBags ?? 0) > 0 || (s.bigBags ?? 0) > 0)) {
      totalDerivedSmall += s.smallBags ?? 0;
      totalDerivedBig += s.bigBags ?? 0;
    } else if (s.bagType === 'B' || (s.bigBags ?? 0) === sourceBags) {
      totalDerivedBig += sourceBags;
    } else if (s.bagType === 'S' || (s.smallBags ?? 0) === sourceBags) {
      totalDerivedSmall += sourceBags;
    } else if ((s.smallBags ?? 0) + (s.bigBags ?? 0) > 0) {
      totalDerivedSmall += s.smallBags ?? 0;
      totalDerivedBig += s.bigBags ?? 0;
    } else {
      totalDerivedSmall += sourceBags;
    }
  }

  let smallBags = totalDerivedSmall;
  let bigBags = totalDerivedBig;

  if (smallBags + bigBags !== totalSourceBags) {
    if (smallBags + bigBags > 0) {
      const scale = totalSourceBags / (smallBags + bigBags);
      smallBags = Math.min(totalSourceBags, Math.round(smallBags * scale));
      bigBags = totalSourceBags - smallBags;
    } else {
      smallBags = totalSourceBags;
      bigBags = 0;
    }
  }

  const first = selectedSources[0];
  const isAllBig = bigBags === totalSourceBags && smallBags === 0;
  const rate = isAllBig
    ? (first?.bigBagPrice ?? first?.bagPrice ?? 15)
    : (first?.smallBagPrice ?? first?.bagPrice ?? 10);

  return {
    category: 'S/B',
    quantity: totalSourceBags,
    smallBags,
    bigBags,
    confirmedSmallBags: smallBags,
    confirmedBigBags: bigBags,
    seasonalBagPrice: rate,
    monthlyBagPrice: '',
    bagPrice: rate,
  };
}

