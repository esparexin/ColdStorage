import {
  calculate3MAdditionalMonths,
  calculateMonthlyElapsedCycles,
  calculateOutwardSeasonalBreakdown,
  calculateRentAmount,
  isHybridBagCategory,
  resolveOutwardRates,
  type OutwardBagCategory,
  type RentType,
} from '@cold-storage/contracts';

export interface ComputeOutwardRentParams {
  rentType: RentType;
  bagCategory: OutwardBagCategory;
  smallBags?: number;
  bigBags?: number;
  quantity?: number;
  manualBagPrice?: number | null;
  seasonalBagPrice?: number | null;
  monthlyBagPrice?: number | null;
  rentMonths?: number | null;
  inwardDate?: Date | string | null;
  deliveryDate?: Date | string | null;
  smallBagPrice?: number | null;
  bigBagPrice?: number | null;
  bagPrice?: number | null;
  monthlySmallBagPrice?: number | null;
  monthlyBigBagPrice?: number | null;
}

export function resolveOutwardBillableMonths(params: {
  rentType: RentType;
  inwardDate?: Date | string | null;
  deliveryDate?: Date | string | null;
  rentMonths?: number | null;
}): number {
  if (params.rentType === 'Monthly' && params.inwardDate && params.deliveryDate) {
    return calculateMonthlyElapsedCycles(params.inwardDate, params.deliveryDate);
  }
  return params.rentMonths ?? 1;
}

export function getOutwardEffectiveRates(
  rentType: RentType,
  overrides?: { smallBagPrice?: number | null; bigBagPrice?: number | null; bagPrice?: number | null } | null,
): { small: number; big: number } {
  return resolveOutwardRates(rentType, overrides);
}

export function computeOutwardRentCharge(params: ComputeOutwardRentParams): number {
  const { rentType, bagCategory, smallBags = 0, bigBags = 0 } = params;

  const isHybrid = isHybridBagCategory(bagCategory);

  if (isHybrid) {
    const qty = params.quantity ?? (smallBags + bigBags);
    const sRate = params.seasonalBagPrice ?? params.manualBagPrice ?? params.bagPrice ?? 0;
    const mRate = params.monthlyBagPrice ?? params.manualBagPrice ?? params.bagPrice ?? 0;
    if (qty <= 0) return 0;

    if (rentType === 'Seasonal_3M' && params.inwardDate && params.deliveryDate) {
      const extraMonths = calculate3MAdditionalMonths(params.inwardDate, params.deliveryDate);
      const baseRent = calculateRentAmount({
        rentType: 'Seasonal_3M',
        bags: qty,
        bagCategory,
        bagPrice: sRate,
        rentMonths: 1,
      });
      const extraRent = extraMonths > 0
        ? calculateRentAmount({
          rentType: 'Monthly',
          bags: qty,
          bagCategory,
          bagPrice: mRate,
          rentMonths: extraMonths,
        })
        : 0;
      return baseRent + extraRent;
    }

    if (rentType === 'Seasonal' && params.inwardDate && params.deliveryDate) {
      const breakdown = calculateOutwardSeasonalBreakdown({
        inwardDate: params.inwardDate,
        deliveryDate: params.deliveryDate,
        smallBags: qty,
        bigBags: 0,
        seasonalRates: { small: sRate, big: sRate },
        monthlyRates: { small: mRate, big: mRate },
      });
      return breakdown.totalRent;
    }

    const months = resolveOutwardBillableMonths({
      rentType,
      inwardDate: params.inwardDate,
      deliveryDate: params.deliveryDate,
      rentMonths: params.rentMonths,
    });
    return calculateRentAmount({
      rentType,
      bags: qty,
      bagCategory,
      bagPrice: rentType === 'Monthly' ? mRate : sRate,
      rentMonths: months,
    });
  }

  const { small: smallRate, big: bigRate } = resolveOutwardRates(rentType, {
    smallBagPrice: params.smallBagPrice,
    bigBagPrice: params.bigBagPrice,
    bagPrice: params.bagPrice,
  });

  const hasSpecificCounts = (smallBags || 0) > 0 || (bigBags || 0) > 0;
  const effectiveSmall = hasSpecificCounts ? (smallBags || 0) : bagCategory === 'Big' ? 0 : smallBags;
  const effectiveBig = hasSpecificCounts ? (bigBags || 0) : bagCategory === 'Small' ? 0 : bigBags;
  const totalBags = effectiveSmall + effectiveBig;

  if (totalBags <= 0) return 0;

  if (rentType === 'Seasonal_3M' && params.inwardDate && params.deliveryDate) {
    const monthlySmall = params.monthlySmallBagPrice ?? smallRate;
    const monthlyBig = params.monthlyBigBagPrice ?? bigRate;
    const extraMonths = calculate3MAdditionalMonths(params.inwardDate, params.deliveryDate);
    const baseRent = calculateRentAmount({
      rentType: 'Seasonal_3M',
      bags: totalBags,
      bagType: 'S+B',
      smallBags: effectiveSmall,
      bigBags: effectiveBig,
      smallBagPrice: smallRate,
      bigBagPrice: bigRate,
      rentMonths: 1,
    });
    const extraRent = extraMonths > 0
      ? calculateRentAmount({
        rentType: 'Monthly',
        bags: totalBags,
        bagType: 'S+B',
        smallBags: effectiveSmall,
        bigBags: effectiveBig,
        smallBagPrice: monthlySmall,
        bigBagPrice: monthlyBig,
        rentMonths: extraMonths,
      })
      : 0;
    return baseRent + extraRent;
  }

  if (rentType === 'Seasonal' && params.inwardDate && params.deliveryDate) {
    const monthlySmall = params.monthlySmallBagPrice ?? smallRate;
    const monthlyBig = params.monthlyBigBagPrice ?? bigRate;
    const breakdown = calculateOutwardSeasonalBreakdown({
      inwardDate: params.inwardDate,
      deliveryDate: params.deliveryDate,
      smallBags: effectiveSmall,
      bigBags: effectiveBig,
      seasonalRates: { small: smallRate, big: bigRate },
      monthlyRates: { small: monthlySmall, big: monthlyBig },
    });
    return breakdown.totalRent;
  }

  const billableMonths = resolveOutwardBillableMonths({
    rentType,
    inwardDate: params.inwardDate,
    deliveryDate: params.deliveryDate,
    rentMonths: params.rentMonths,
  });

  return calculateRentAmount({
    rentType,
    bags: totalBags,
    bagType: 'S+B',
    smallBags: effectiveSmall,
    bigBags: effectiveBig,
    smallBagPrice: smallRate,
    bigBagPrice: bigRate,
    rentMonths: billableMonths,
  });
}

export function formatOutwardRentFormula(
  rentType: RentType,
  category: OutwardBagCategory,
  smallQty: number,
  bigQty: number,
  smallRate: number,
  bigRate: number,
  months?: number | null,
): string {
  const term = rentType === 'Seasonal'
    ? 'season total'
    : rentType === 'Seasonal_3M'
      ? '3-mo season total'
      : `${months ?? 1} mo`;
  if (isHybridBagCategory(category)) {
    const totalQty = smallQty + bigQty;
    return `${totalQty} Hybrid bags × ₹${smallRate}/bag × ${term}`;
  }
  if (category === 'Small') {
    return `${smallQty} bags × ₹${smallRate}/bag × ${term}`;
  }
  if (category === 'Big') {
    return `${bigQty} bags × ₹${bigRate}/bag × ${term}`;
  }
  return `(${smallQty} Small × ₹${smallRate} + ${bigQty} Big × ₹${bigRate}) × ${term}`;
}
