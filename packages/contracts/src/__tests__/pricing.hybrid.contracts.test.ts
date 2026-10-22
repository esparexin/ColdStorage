import { describe, expect, it } from 'vitest';
import { calculateRentAmount, deriveBagPrice } from '../index.js';

describe('Monthly rent calculation across S/B and Hybrid SSOT', () => {
  it('calculates monthly rent for S/B with verified differential rates', () => {
    const rent = calculateRentAmount({
      rentType: 'Monthly', bags: 100, bagType: 'S+B', smallBags: 50, bigBags: 50,
      smallBagPrice: 10, bigBagPrice: 15, rentMonths: 3,
    });
    expect(rent).toBe(3750);
  });

  it('calculates monthly rent for single-type S and B lots', () => {
    expect(
      calculateRentAmount({
        rentType: 'Monthly', bags: 100, bagType: 'S', smallBagPrice: 10, rentMonths: 2,
      }),
    ).toBe(2000);

    expect(
      calculateRentAmount({
        rentType: 'Monthly', bags: 100, bagType: 'B', bigBagPrice: 15, rentMonths: 2,
      }),
    ).toBe(3000);
  });

  it('calculates monthly rent for Hybrid bag category with authoritative bag rate', () => {
    const rent = calculateRentAmount({
      rentType: 'Monthly', bags: 80, bagCategory: 'Hybrid', bagPrice: 12, rentMonths: 4,
    });
    expect(rent).toBe(3840);
  });

  it('derives bag rate from smallBagPrice and bigBagPrice when bagPrice is omitted', () => {
    expect(
      deriveBagPrice({
        rentType: 'Monthly', bags: 100, smallBagPrice: 14, bigBagPrice: 14,
      }),
    ).toBe(14);

    expect(
      deriveBagPrice({
        rentType: 'Monthly', bags: 100, smallBagPrice: 10, bigBagPrice: 15,
      }),
    ).toBe(10);
  });
});
