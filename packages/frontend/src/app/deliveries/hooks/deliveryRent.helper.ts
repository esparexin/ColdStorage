import { CANONICAL_BAG_RATES, calculateRentAmount, type RentType } from '@cold-storage/contracts';

export type OutwardBagCategory = 'Small' | 'Big' | 'Small & Big';

export interface ComputeOutwardRentParams {
  rentType: RentType;
  bagCategory: OutwardBagCategory;
  smallBags: number;
  bigBags: number;
  rentMonths?: number | null;
}

export function computeOutwardRentCharge(params: ComputeOutwardRentParams): number {
  const { rentType, bagCategory, smallBags, bigBags, rentMonths } = params;
  const rates = CANONICAL_BAG_RATES[rentType] ?? { small: 10, big: 15 };

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
    smallBagPrice: rates.small,
    bigBagPrice: rates.big,
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
