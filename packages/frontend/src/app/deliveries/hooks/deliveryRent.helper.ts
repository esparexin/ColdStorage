import { calculateRentAmount, resolveOutwardRates, type RentType } from '@cold-storage/contracts';

export type OutwardBagCategory = 'Small' | 'Big' | 'Small & Big';

export interface ComputeOutwardRentParams {
  rentType: RentType;
  bagCategory: OutwardBagCategory;
  smallBags: number;
  bigBags: number;
  rentMonths?: number | null;
  smallBagPrice?: number | null;
  bigBagPrice?: number | null;
  bagPrice?: number | null;
}

export function getOutwardEffectiveRates(
  rentType: RentType,
  overrides?: { smallBagPrice?: number | null; bigBagPrice?: number | null; bagPrice?: number | null } | null,
): { small: number; big: number } {
  return resolveOutwardRates(rentType, overrides);
}

export function computeOutwardRentCharge(params: ComputeOutwardRentParams): number {
  const { rentType, bagCategory, smallBags, bigBags, rentMonths } = params;
  const { small: smallRate, big: bigRate } = resolveOutwardRates(rentType, {
    smallBagPrice: params.smallBagPrice,
    bigBagPrice: params.bigBagPrice,
    bagPrice: params.bagPrice,
  });

  const effectiveSmall = bagCategory === 'Big' ? 0 : smallBags;
  const effectiveBig = bagCategory === 'Small' ? 0 : bigBags;
  const totalBags = effectiveSmall + effectiveBig;

  if (totalBags <= 0) return 0;

  return calculateRentAmount({
    rentType,
    bags: totalBags,
    bagType: 'S+B',
    smallBags: effectiveSmall,
    bigBags: effectiveBig,
    smallBagPrice: smallRate,
    bigBagPrice: bigRate,
    rentMonths: rentMonths ?? 1,
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
  const term = rentType === 'Seasonal' ? '10 mos season' : `${months ?? 1} mo`;
  if (category === 'Small') {
    return `${smallQty} bags × ₹${smallRate}/bag × ${term}`;
  }
  if (category === 'Big') {
    return `${bigQty} bags × ₹${bigRate}/bag × ${term}`;
  }
  return `(${smallQty} Small × ₹${smallRate} + ${bigQty} Big × ₹${bigRate}) × ${term}`;
}
