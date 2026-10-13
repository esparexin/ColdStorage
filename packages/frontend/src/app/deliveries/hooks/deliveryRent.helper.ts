import {
  calculateMonthlyElapsedCycles,
  calculateOutwardSeasonalBreakdown,
  calculateRentAmount,
  resolveOutwardRates,
  type OutwardBagCategory,
  type RentType,
} from '@cold-storage/contracts';

export type { OutwardBagCategory };

export interface ComputeOutwardRentParams {
  rentType: RentType;
  bagCategory: OutwardBagCategory;
  smallBags?: number;
  bigBags?: number;
  quantity?: number;
  manualBagPrice?: number | null;
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

  if (bagCategory === 'Modern Size' || bagCategory === 'Mixed') {
    const qty = params.quantity ?? (smallBags + bigBags);
    const rate = params.manualBagPrice ?? params.bagPrice ?? 0;
    if (qty <= 0 || rate <= 0) return 0;
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
      bagPrice: rate,
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
  const term = rentType === 'Seasonal' ? 'season total' : `${months ?? 1} mo`;
  if (category === 'Modern Size' || category === 'Mixed') {
    const totalQty = smallQty + bigQty;
    return `${totalQty} Modern Size bags × ₹${smallRate}/bag × ${term}`;
  }
  if (category === 'Small') {
    return `${smallQty} bags × ₹${smallRate}/bag × ${term}`;
  }
  if (category === 'Big') {
    return `${bigQty} bags × ₹${bigRate}/bag × ${term}`;
  }
  return `(${smallQty} Small × ₹${smallRate} + ${bigQty} Big × ₹${bigRate}) × ${term}`;
}
