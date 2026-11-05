import { describe, expect, it } from 'vitest';
import { calculateOutwardSeasonalBreakdown, deriveNetStorageRate } from '@cold-storage/contracts';
import { computeOutwardRentCharge } from '../deliveryRent.helper';

describe('deliveryRent.parity - Mandatory Calculation Rules (Hamali-Inclusive Subscriptions)', () => {
  const commodityRates = { small: 125, big: 205 };
  const monthlyRates = { small: 45, big: 65 };
  const inwardDate = '2026-03-15';
  const deliveryDate = '2027-01-20'; // Season 2026 + 1 month extension (Jan 2027)

  it('correctly derives net storage rates by deducting Hamali ₹25 from seasonal subscription rates', () => {
    // Seasonal subscription rules:
    // Small: ₹125 − ₹25 = ₹100
    // Big: ₹205 − ₹25 = ₹180
    // Hybrid: ₹145 − ₹25 = ₹120
    expect(deriveNetStorageRate(125, 25)).toBe(100);
    expect(deriveNetStorageRate(205, 25)).toBe(180);
    expect(deriveNetStorageRate(145, 25)).toBe(120);

    // Monthly subscription rules:
    // Hybrid: ₹75 − ₹25 = ₹50
    expect(deriveNetStorageRate(75, 25)).toBe(50);
  });

  it('calculates storage rent of ₹12,800 for 19 Small + 41 Big (60 bags) with ₹25 Hamali deducted from subscription rate', () => {
    const storageRent = computeOutwardRentCharge({
      rentType: 'Seasonal',
      bagCategory: 'Small & Big',
      smallBags: 19,
      bigBags: 41,
      smallBagPrice: commodityRates.small,
      bigBagPrice: commodityRates.big,
      monthlySmallBagPrice: monthlyRates.small,
      monthlyBigBagPrice: monthlyRates.big,
      inwardDate,
      deliveryDate,
      hamaliRate: 25,
    });

    // 19 Small @ (100 + 45 = 145) = 2,755
    // 41 Big @ (180 + 65 = 245) = 10,045
    // Total Storage Rent = 2,755 + 10,045 = 12,800
    expect(storageRent).toBe(12800);
  });

  it('calculates complete breakdown: ₹12,800 Storage Rent + ₹1,500 Hamali = ₹14,300 Total Payable', () => {
    const breakdown = calculateOutwardSeasonalBreakdown({
      inwardDate,
      deliveryDate,
      smallBags: 19,
      bigBags: 41,
      seasonalRates: commodityRates,
      monthlyRates,
      hamaliRate: 25,
    });

    expect(breakdown.storageRent).toBe(12800);
    expect(breakdown.hamaliAmount).toBe(1500); // 60 bags * ₹25
    expect(breakdown.totalAmount).toBe(14300); // Storage (12,800) + Hamali (1,500) = 14,300
  });

  it('calculates Monthly Hybrid storage rent deducting Hamali from subscription rate (₹75 - ₹25 = ₹50/bag)', () => {
    const storageRent = computeOutwardRentCharge({
      rentType: 'Monthly',
      bagCategory: 'Hybrid',
      quantity: 10,
      monthlyBagPrice: 75,
      rentMonths: 2,
      hamaliRate: 25,
    });

    // 10 bags * (75 - 25 = 50 net) * 2 months = 1,000
    expect(storageRent).toBe(1000);
  });

  it('preserves historical zero Hamali without applying retrospective Hamali charges or deductions', () => {
    const grnWithZeroHamali = {
      hamaliRate: 25,
      hamaliAmount: 0, // Explicit historical snapshot = 0
    };

    const effectiveHamaliRate = grnWithZeroHamali.hamaliAmount === 0 ? 0 : grnWithZeroHamali.hamaliRate;
    expect(effectiveHamaliRate).toBe(0);

    const storageRent = computeOutwardRentCharge({
      rentType: 'Seasonal',
      bagCategory: 'Small & Big',
      smallBags: 19,
      bigBags: 41,
      smallBagPrice: commodityRates.small,
      bigBagPrice: commodityRates.big,
      monthlySmallBagPrice: monthlyRates.small,
      monthlyBigBagPrice: monthlyRates.big,
      inwardDate,
      deliveryDate,
      hamaliRate: effectiveHamaliRate,
    });

    // No hamali deduction when hamaliRate is 0: 19 * 170 + 41 * 270 = 14,300
    expect(storageRent).toBe(14300);

    const breakdown = calculateOutwardSeasonalBreakdown({
      inwardDate,
      deliveryDate,
      smallBags: 19,
      bigBags: 41,
      seasonalRates: commodityRates,
      monthlyRates,
      hamaliRate: effectiveHamaliRate,
    });

    expect(breakdown.storageRent).toBe(14300);
    expect(breakdown.hamaliAmount).toBe(0);
    expect(breakdown.totalAmount).toBe(14300);
  });

  it('asserts 100% parity between frontend storage rent and backend expectedRentCharge', () => {
    const frontendStorageRent = computeOutwardRentCharge({
      rentType: 'Seasonal',
      bagCategory: 'Small & Big',
      smallBags: 19,
      bigBags: 41,
      smallBagPrice: commodityRates.small,
      bigBagPrice: commodityRates.big,
      monthlySmallBagPrice: monthlyRates.small,
      monthlyBigBagPrice: monthlyRates.big,
      inwardDate,
      deliveryDate,
      hamaliRate: 25,
    });

    // Mirroring backend delivery-rent.helper.ts:187 with effectiveHamaliRate
    const backendBreakdown = calculateOutwardSeasonalBreakdown({
      inwardDate,
      deliveryDate,
      smallBags: 19,
      bigBags: 41,
      seasonalRates: commodityRates,
      monthlyRates,
      hamaliRate: 25,
    });

    expect(frontendStorageRent).toBe(backendBreakdown.totalRent);
    expect(frontendStorageRent).toBe(12800);
    expect(backendBreakdown.totalRent).toBe(12800);
  });
});
