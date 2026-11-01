import type { CanonicalBagRate } from './pricing.js';

/**
 * Discriminated bag-pricing contract (SSOT).
 * Prevents Hybrid single-rate fields from polluting S/B calculations and vice-versa.
 */
export interface SbOutwardPricing {
  isHybrid: false;
  seasonalRates: CanonicalBagRate;
  monthlyRates: CanonicalBagRate;
  smallBags: number;
  bigBags: number;
  // Disallow Hybrid scalar price overrides on S/B
  seasonalBagPrice?: never;
  monthlyBagPrice?: never;
  bagPrice?: never;
}

export interface HybridOutwardPricing {
  isHybrid: true;
  totalBags: number;
  seasonalBagPrice?: number | null;
  monthlyBagPrice?: number | null;
  bagPrice?: number | null;
  // Disallow S/B rate overrides on Hybrid
  seasonalRates?: never;
  monthlyRates?: never;
  smallBags?: never;
  bigBags?: never;
}

export type DiscriminatedOutwardPricing = SbOutwardPricing | HybridOutwardPricing;

export interface ResolvedOutwardBreakdownRates {
  isHybrid: boolean;
  effectiveSeasonalRates: CanonicalBagRate;
  effectiveMonthlyRates: CanonicalBagRate;
  smallBags: number;
  bigBags: number;
}

/**
 * Resolves effective rates and bag counts according to the discriminated bag-pricing SSOT.
 * Guarantees that S/B calculations preserve differential Small and Big rates.
 */
export function resolveDiscriminatedOutwardRates(
  pricing: DiscriminatedOutwardPricing,
): ResolvedOutwardBreakdownRates {
  if (pricing.isHybrid) {
    const sPrice = pricing.seasonalBagPrice ?? pricing.bagPrice ?? 0;
    const mPrice = pricing.monthlyBagPrice ?? pricing.bagPrice ?? 0;
    return {
      isHybrid: true,
      effectiveSeasonalRates: { small: sPrice, big: sPrice },
      effectiveMonthlyRates: { small: mPrice, big: mPrice },
      smallBags: pricing.totalBags,
      bigBags: 0,
    };
  }

  return {
    isHybrid: false,
    effectiveSeasonalRates: pricing.seasonalRates,
    effectiveMonthlyRates: pricing.monthlyRates,
    smallBags: pricing.smallBags,
    bigBags: pricing.bigBags,
  };
}
