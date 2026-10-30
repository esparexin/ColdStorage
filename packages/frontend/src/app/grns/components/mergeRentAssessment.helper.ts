import {
  isHybridBagCategory,
  resolveSeasonalElapsedPeriods,
  seasonYearForInwardDate,
  type Commodity,
  type Grn,
  type OutwardBagCategory,
  type RentSummaryDto,
} from '@cold-storage/contracts';
import { computeOutwardRentCharge } from '../../deliveries/hooks/deliveryRent.helper';
import { resolveTransferRates } from './transferRentRates.helper';
import type { BagConfirmationValue } from './bagConfirmation.helper';
import {
  deriveMergeRentAssessment,
  type DerivedMergeRentAssessment,
} from './mergeRentObligation.helper';

export {
  deriveMergeRentAssessment,
  type DerivedMergeRentAssessment,
};

export interface MergeSourceRentCalculation {
  isHybrid: boolean;
  bagTypeLabel: 'Hybrid' | 'S/B';
  smallBags: number;
  bigBags: number;
  totalBags: number;
  totalRent: number;
  hamaliAmount: number;
  totalAmountToPay: number;
  isConfirmed: boolean;
  bagCountLabel: string;
}

export function calculateMergeSourceRentSummary(params: {
  source: Grn;
  confirmation?: BagConfirmationValue | null;
  movementDate: string;
  commodityHamaliRate?: number;
  targetGrnDate?: Date | string | null;
  summary?: RentSummaryDto | null;
  commodity?: Pick<Commodity, 'rates'> | null;
}): MergeSourceRentCalculation {
  const {
    source,
    confirmation,
    movementDate,
    commodityHamaliRate = 0,
    targetGrnDate,
    summary,
    commodity,
  } = params;

  const sourceBags = source.closingBags ?? source.bags;

  const isHybrid =
    confirmation?.category === 'Hybrid' ||
    isHybridBagCategory(source.bagType) ||
    isHybridBagCategory(confirmation?.category);

  const hasChoice = typeof confirmation?.smallBags === 'number' && typeof confirmation?.bigBags === 'number';
  const isConfirmed = isHybrid || hasChoice || Boolean(source.isCompositionVerified);

  const confirmedSmall = typeof confirmation?.smallBags === 'number'
    ? confirmation.smallBags
    : (source.smallBags ?? sourceBags);
  const confirmedBig = typeof confirmation?.bigBags === 'number'
    ? confirmation.bigBags
    : (source.bigBags ?? 0);

  const smallBags = isHybrid ? sourceBags : confirmedSmall;
  const bigBags = isHybrid ? 0 : confirmedBig;
  const bagCategory = (isHybrid ? 'Hybrid' : (confirmation?.category || 'S/B')) as OutwardBagCategory;

  const targetSeason = targetGrnDate ? seasonYearForInwardDate(targetGrnDate) : null;
  const sourceSeason = source.date ? seasonYearForInwardDate(source.date) : null;
  const excludePeriodKeys: string[] = [];
  if (targetSeason !== null && sourceSeason !== null && targetSeason > sourceSeason && source.date) {
    const elapsed = resolveSeasonalElapsedPeriods(source.date, movementDate);
    for (const p of elapsed) {
      if (p.period === 'SEASON' && p.seasonYear >= targetSeason) {
        excludePeriodKeys.push(p.key);
      }
    }
  }

  const manualBagPrice = typeof confirmation?.bagPrice === 'number' && confirmation.bagPrice > 0
    ? confirmation.bagPrice
    : source.bagPrice;
  const seasonalBagPrice = typeof confirmation?.seasonalBagPrice === 'number' && confirmation.seasonalBagPrice > 0
    ? confirmation.seasonalBagPrice
    : undefined;
  const monthlyBagPrice = typeof confirmation?.monthlyBagPrice === 'number' && confirmation.monthlyBagPrice > 0
    ? confirmation.monthlyBagPrice
    : undefined;

  const { seasonalRates, monthlyRates } = resolveTransferRates(source, commodity);

  let calculatedRent = 0;
  if (isConfirmed) {
    calculatedRent = computeOutwardRentCharge({
      rentType: source.rentType,
      bagCategory,
      smallBags,
      bigBags,
      quantity: isHybrid ? sourceBags : undefined,
      manualBagPrice: typeof manualBagPrice === 'number' ? manualBagPrice : undefined,
      seasonalBagPrice,
      monthlyBagPrice,
      inwardDate: source.date,
      deliveryDate: movementDate,
      smallBagPrice: source.smallBagPrice ?? seasonalRates.small,
      bigBagPrice: source.bigBagPrice ?? seasonalRates.big,
      monthlySmallBagPrice: monthlyRates.small,
      monthlyBigBagPrice: monthlyRates.big,
      bagPrice: source.bagPrice,
      excludePeriodKeys,
    });
  }

  const { historicalObligation } = deriveMergeRentAssessment({
    source,
    summary,
    repackMode: false,
    commodityHamaliRate,
    calculatedRent,
  });

  const storedRent = summary?.rentAmount ?? source.rentAmount ?? 0;
  const hasManualRateOverride =
    (typeof confirmation?.bagPrice === 'number' && confirmation.bagPrice > 0) ||
    (typeof confirmation?.seasonalBagPrice === 'number' && confirmation.seasonalBagPrice > 0) ||
    (typeof confirmation?.monthlyBagPrice === 'number' && confirmation.monthlyBagPrice > 0);

  let totalRent: number;
  if (hasManualRateOverride) {
    totalRent = calculatedRent;
  } else if (storedRent > 0) {
    totalRent = Math.max(storedRent, calculatedRent);
  } else {
    totalRent = calculatedRent > 0 ? calculatedRent : (historicalObligation > 0 ? historicalObligation : 0);
  }

  // Repacking Hamali is never calculated or applied in Step 2; it applies exclusively
  // in Step 4 once physical repacking and bag counts are explicitly confirmed.
  const hamaliAmount = 0;
  const totalAmountToPay = totalRent;

  let bagCountLabel = `${sourceBags} Bags`;
  if (!isHybrid) {
    if (!isConfirmed) {
      bagCountLabel = 'Pending Split';
    } else if (smallBags > 0 && bigBags > 0) {
      bagCountLabel = `${sourceBags} Bags (${smallBags} Small, ${bigBags} Big)`;
    } else if (smallBags > 0) {
      bagCountLabel = `${sourceBags} Bags (${smallBags} Small)`;
    } else if (bigBags > 0) {
      bagCountLabel = `${sourceBags} Bags (${bigBags} Big)`;
    } else {
      bagCountLabel = `${sourceBags} Bags`;
    }
  }

  return {
    isHybrid,
    bagTypeLabel: isHybrid ? 'Hybrid' : 'S/B',
    smallBags,
    bigBags,
    totalBags: sourceBags,
    totalRent,
    hamaliAmount,
    totalAmountToPay,
    isConfirmed,
    bagCountLabel,
  };
}

export function calculateMergeGrandTotal(params: {
  selectedSources: Grn[];
  sourceConfirmations?: Record<string, BagConfirmationValue>;
  movementDate: string;
  commodityHamaliRate?: number;
  targetGrnDate?: Date | string | null;
  sourceRentSummaries?: Record<string, RentSummaryDto>;
  commodities?: Commodity[];
}): number {
  const {
    selectedSources,
    sourceConfirmations = {},
    movementDate,
    commodityHamaliRate = 0,
    targetGrnDate,
    sourceRentSummaries,
    commodities,
  } = params;

  return selectedSources.reduce((acc, source) => {
    const commodity = commodities?.find((c) => c.id === source.commodityId);
    const calc = calculateMergeSourceRentSummary({
      source,
      confirmation: sourceConfirmations[source.id],
      movementDate,
      commodityHamaliRate,
      targetGrnDate,
      summary: sourceRentSummaries?.[source.id],
      commodity,
    });
    return acc + calc.totalAmountToPay;
  }, 0);
}
