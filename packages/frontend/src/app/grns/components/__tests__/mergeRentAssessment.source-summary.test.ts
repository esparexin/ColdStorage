import { describe, expect, it } from 'vitest';
import { calculateMergeSourceRentSummary } from '../mergeRentAssessment.helper';
import { makeSourceGrn } from './mergeRentAssessment.test-fixtures';

describe('mergeRentAssessment.helper - calculateMergeSourceRentSummary', () => {
  it('computes Hybrid source GRN rent, hamali, and total to pay correctly', () => {
    const source = makeSourceGrn({
      id: 'grn-source-0008',
      grnNumber: '0008',
      date: new Date('2025-03-01'),
      bags: 100,
      closingBags: 100,
      bagType: 'Hybrid',
      rentType: 'Seasonal',
    });

    const result = calculateMergeSourceRentSummary({
      source,
      confirmation: {
        category: 'Hybrid',
        quantity: 100,
        smallBags: 100,
        bigBags: 0,
        seasonalBagPrice: 120,
        monthlyBagPrice: 60,
        bagPrice: 120,
      },
      movementDate: '2026-10-23',
      targetGrnDate: new Date('2026-03-01'),
      commodityHamaliRate: 25,
    });

    expect(result.isHybrid).toBe(true);
    expect(result.bagTypeLabel).toBe('Hybrid');
    expect(result.totalBags).toBe(100);
    expect(result.bagCountLabel).toBe('100 Bags');
    expect(result.hamaliAmount).toBe(2500); // 100 bags @ ₹25
    // Option A net storage rent: 100 * (120 - 25) (2025 season) + 100 * 60 * 2 (Jan-Feb 2026) = 21,500
    expect(result.totalRent).toBe(21500);
    expect(result.totalAmountToPay).toBe(24000); // 21,500 storage rent + 2,500 hamali
  });

  it('computes S/B source GRN with split counts and formats breakdown label', () => {
    const source = makeSourceGrn({
      id: 'grn-source-0007',
      grnNumber: '0007',
      date: new Date('2024-03-01'),
      bags: 100,
      closingBags: 100,
      bagType: 'S/B',
      smallBags: 60,
      bigBags: 40,
      smallBagPrice: 100,
      bigBagPrice: 150,
      rentType: 'Seasonal',
    });

    const result = calculateMergeSourceRentSummary({
      source,
      confirmation: {
        category: 'S/B',
        quantity: 100,
        smallBags: 60,
        bigBags: 40,
        seasonalBagPrice: '',
        monthlyBagPrice: '',
        bagPrice: '',
      },
      movementDate: '2024-11-01',
      commodityHamaliRate: 20,
    });

    expect(result.isHybrid).toBe(false);
    expect(result.bagTypeLabel).toBe('S/B');
    expect(result.smallBags).toBe(60);
    expect(result.bigBags).toBe(40);
    expect(result.bagCountLabel).toBe('100 Bags (60 Small, 40 Big)');
    expect(result.hamaliAmount).toBe(2000); // 100 bags @ ₹20
    // 60 * 100 + 40 * 150 = 6,000 + 6,000 = 12,000
    expect(result.totalRent).toBe(12000);
    expect(result.totalAmountToPay).toBe(14000);
  });

  it('handles unconfirmed S/B composition by labeling Pending Split', () => {
    const source = makeSourceGrn({
      id: 'grn-source-0005',
      grnNumber: '0005',
      date: new Date('2024-03-01'),
      bags: 100,
      closingBags: 100,
      bagType: 'S/B',
      smallBags: 0,
      bigBags: 0,
      isCompositionVerified: false,
    });

    const result = calculateMergeSourceRentSummary({
      source,
      confirmation: {
        category: 'S/B',
        quantity: '',
        smallBags: '',
        bigBags: '',
        seasonalBagPrice: '',
        monthlyBagPrice: '',
        bagPrice: '',
      },
      movementDate: '2024-11-01',
      commodityHamaliRate: 0,
    });

    expect(result.isHybrid).toBe(false);
    expect(result.isConfirmed).toBe(false);
    expect(result.bagCountLabel).toBe('Pending Split');
  });

  it('calculates hamali from initial intake bags and respects snapshot even after partial deliveries', () => {
    const source = makeSourceGrn({
      id: 'grn-source-partially-delivered',
      grnNumber: '0033',
      date: new Date('2025-03-01'),
      bags: 100,
      closingBags: 60,
      hamaliAmount: 500,
      hamaliRate: 5,
      bagType: 'Hybrid',
      rentType: 'Seasonal',
    });

    const result = calculateMergeSourceRentSummary({
      source,
      confirmation: {
        category: 'Hybrid',
        quantity: 60,
        smallBags: 60,
        bigBags: 0,
        seasonalBagPrice: 50,
        monthlyBagPrice: 10,
        bagPrice: 50,
      },
      movementDate: '2025-10-23',
      commodityHamaliRate: 5,
    });

    expect(result.hamaliAmount).toBe(500);
  });
});
