import { describe, expect, it } from 'vitest';
import {
  computeOutwardRentCharge,
  formatOutwardRentFormula,
} from '../deliveryRent.helper';

describe('deliveryRent Seasonal_3M parity (reuse Seasonal rates, SSOT helpers)', () => {
  it('charges 3M non-Hybrid same-year at whole-season total only', () => {
    const rent = computeOutwardRentCharge({
      rentType: 'Seasonal_3M',
      bagCategory: 'Small & Big',
      smallBags: 20,
      bigBags: 30,
      smallBagPrice: 10,
      bigBagPrice: 15,
      monthlySmallBagPrice: 10,
      monthlyBigBagPrice: 15,
      inwardDate: new Date(2026, 2, 10),
      deliveryDate: new Date(2026, 4, 20),
    });
    // cycles Mar10->May20 = 3, extra = 0; base 20*10+30*15 = 650
    expect(rent).toBe(650);
  });

  it('charges 3M non-Hybrid extended with monthly extra (backend parity)', () => {
    const rent = computeOutwardRentCharge({
      rentType: 'Seasonal_3M',
      bagCategory: 'Small & Big',
      smallBags: 20,
      bigBags: 30,
      smallBagPrice: 10,
      bigBagPrice: 15,
      monthlySmallBagPrice: 12,
      monthlyBigBagPrice: 18,
      inwardDate: new Date(2026, 2, 10),
      deliveryDate: new Date(2026, 7, 15),
    });
    // cycles Mar10->Aug15 = 6, extra = 3; base 650 + (20*12+30*18)*3 = 650+2340
    expect(rent).toBe(2990);
  });

  it('charges 3M Hybrid same-year at manual seasonal rate only', () => {
    const rent = computeOutwardRentCharge({
      rentType: 'Seasonal_3M',
      bagCategory: 'Hybrid',
      quantity: 20,
      seasonalBagPrice: 50,
      monthlyBagPrice: 60,
      inwardDate: new Date(2026, 2, 10),
      deliveryDate: new Date(2026, 4, 20),
    });
    expect(rent).toBe(1000);
  });

  it('charges 3M Hybrid extended with manual monthly extra (backend parity)', () => {
    const rent = computeOutwardRentCharge({
      rentType: 'Seasonal_3M',
      bagCategory: 'Hybrid',
      quantity: 20,
      seasonalBagPrice: 100,
      monthlyBagPrice: 10,
      inwardDate: new Date(2026, 2, 10),
      deliveryDate: new Date(2026, 7, 15),
    });
    // base 20*100=2000 + extra 20*10*3=600
    expect(rent).toBe(2600);
  });

  it('labels 3M formula with 3-mo season total', () => {
    expect(formatOutwardRentFormula('Seasonal_3M', 'Small', 50, 0, 10, 15)).toBe(
      '50 bags × ₹10/bag × 3-mo season total',
    );
  });

  it('falls back to seasonal rate for 3M Hybrid when dates are missing', () => {
    const rent = computeOutwardRentCharge({
      rentType: 'Seasonal_3M',
      bagCategory: 'Hybrid',
      quantity: 10,
      seasonalBagPrice: 50,
      monthlyBagPrice: 60,
    });
    expect(rent).toBe(500);
  });
});
