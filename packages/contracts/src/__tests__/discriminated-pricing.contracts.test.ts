import { describe, it, expect } from 'vitest';
import { resolveDiscriminatedOutwardRates } from '../index.js';

describe('resolveDiscriminatedOutwardRates (Discriminated Pricing SSOT)', () => {
  it('strictly preserves differential Small and Big rates for S/B pricing without rate bleed', () => {
    const resolved = resolveDiscriminatedOutwardRates({
      isHybrid: false,
      seasonalRates: { small: 110, big: 185 },
      monthlyRates: { small: 30, big: 40 },
      smallBags: 10,
      bigBags: 8,
    });

    expect(resolved.isHybrid).toBe(false);
    expect(resolved.effectiveSeasonalRates).toEqual({ small: 110, big: 185 });
    expect(resolved.effectiveMonthlyRates).toEqual({ small: 30, big: 40 });
    expect(resolved.smallBags).toBe(10);
    expect(resolved.bigBags).toBe(8);
  });

  it('applies uniform single rates across Small and Big for Hybrid pricing', () => {
    const resolved = resolveDiscriminatedOutwardRates({
      isHybrid: true,
      totalBags: 18,
      seasonalBagPrice: 150,
      monthlyBagPrice: 35,
    });

    expect(resolved.isHybrid).toBe(true);
    expect(resolved.effectiveSeasonalRates).toEqual({ small: 150, big: 150 });
    expect(resolved.effectiveMonthlyRates).toEqual({ small: 35, big: 35 });
    expect(resolved.smallBags).toBe(18);
    expect(resolved.bigBags).toBe(0);
  });
});
