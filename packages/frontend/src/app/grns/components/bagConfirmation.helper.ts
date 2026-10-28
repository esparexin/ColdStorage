import {
  isHybridBagCategory,
  resolveStoredCompositionVerified,
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

  const anyUnverified = selectedSources.some((s) => !resolveStoredCompositionVerified(s));
  if (anyUnverified) {
    return {
      category: 'S/B',
      quantity: totalSourceBags,
      smallBags: '',
      bigBags: '',
      confirmedSmallBags: '',
      confirmedBigBags: '',
      seasonalBagPrice: selectedSources[0]?.smallBagPrice ?? selectedSources[0]?.bagPrice ?? '',
      monthlyBagPrice: '',
      bagPrice: selectedSources[0]?.bagPrice ?? '',
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

