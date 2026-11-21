import { describe, expect, it } from 'vitest';
import {
  calculateMergeGrandTotal,
  calculateMergeSourceRentSummary,
} from '../mergeRentAssessment.helper';
import type { BagConfirmationValue } from '../bagConfirmation.helper';
import { makeSourceGrn } from './mergeRentAssessment.test-fixtures';

describe('mergeRentAssessment.helper - calculateMergeGrandTotal', () => {
  it('accurately calculates grand total rent across multiple source GRNs with different profiles', () => {
    // GRN #0012: S/B, 12 bags (8 Small, 4 Big)
    const grn0012 = makeSourceGrn({
      id: 'grn-0012',
      grnNumber: '0012',
      date: new Date('2025-03-01'),
      bags: 12,
      closingBags: 12,
      bagType: 'S/B',
      smallBags: 8,
      bigBags: 4,
      smallBagPrice: 10,
      bigBagPrice: 15,
      rentType: 'Seasonal',
    });

    // GRN #0010: Hybrid, 10 bags
    const grn0010 = makeSourceGrn({
      id: 'grn-0010',
      grnNumber: '0010',
      date: new Date('2024-03-01'),
      bags: 10,
      closingBags: 10,
      bagType: 'Hybrid',
      rentType: 'Seasonal',
    });

    const selectedSources = [grn0012, grn0010];
    const sourceConfirmations: Record<string, BagConfirmationValue> = {
      'grn-0012': {
        category: 'S/B' as const,
        quantity: 12,
        smallBags: 8,
        bigBags: 4,
        seasonalBagPrice: 15,
        monthlyBagPrice: '',
        bagPrice: 15,
      },
      'grn-0010': {
        category: 'Hybrid' as const,
        quantity: 10,
        smallBags: 10,
        bigBags: 0,
        seasonalBagPrice: 110,
        monthlyBagPrice: 70,
        bagPrice: 110,
      },
    };

    const grandTotal = calculateMergeGrandTotal({
      selectedSources,
      sourceConfirmations,
      movementDate: '2026-10-23',
      targetGrnDate: new Date('2026-03-01'),
      commodityHamaliRate: 25,
    });

    // Grand Total: Storage Rent with Option A net deduction + Hamali = 5,330
    expect(grandTotal).toBe(5330);
  });

  it('updates dynamically when a source confirmation rate or split changes', () => {
    const grn0010 = makeSourceGrn({
      id: 'grn-0010',
      grnNumber: '0010',
      date: new Date('2024-03-01'),
      bags: 10,
      closingBags: 10,
      bagType: 'Hybrid',
      rentType: 'Seasonal',
    });

    const initialTotal = calculateMergeGrandTotal({
      selectedSources: [grn0010],
      sourceConfirmations: {
        'grn-0010': {
          category: 'Hybrid',
          quantity: 10,
          smallBags: 10,
          bigBags: 0,
          seasonalBagPrice: 110,
          monthlyBagPrice: 70,
          bagPrice: 110,
        },
      },
      movementDate: '2026-10-23',
      targetGrnDate: new Date('2026-03-01'),
      commodityHamaliRate: 25,
    });

    expect(initialTotal).toBe(4750); // Net storage rent + hamali

    // Increase seasonal rate from 110 to 120
    const updatedTotal = calculateMergeGrandTotal({
      selectedSources: [grn0010],
      sourceConfirmations: {
        'grn-0010': {
          category: 'Hybrid',
          quantity: 10,
          smallBags: 10,
          bigBags: 0,
          seasonalBagPrice: 120,
          monthlyBagPrice: 70,
          bagPrice: 120,
        },
      },
      movementDate: '2026-10-23',
      targetGrnDate: new Date('2026-03-01'),
      commodityHamaliRate: 25,
    });

    // 2 seasonal cycles (2024 and 2025) each increase by 10 * 10 = 100 -> +200 total (4,750 + 200 = 4,950)
    expect(updatedTotal).toBe(4950);
  });

  it('preserves authoritative stored seasonal obligations for GRN 0010 and GRN 0012 totaling ₹39,700 without manual rate overrides', () => {
    const liveGrn0010 = makeSourceGrn({
      id: 'grn-live-0010',
      grnNumber: '0010',
      date: new Date('2024-06-11'),
      bags: 10,
      closingBags: 10,
      bagType: 'S/B',
      rentType: 'Seasonal',
      rentAmount: 26100,
    });

    const liveGrn0012 = makeSourceGrn({
      id: 'grn-live-0012',
      grnNumber: '0012',
      date: new Date('2025-07-17'),
      bags: 12,
      closingBags: 12,
      bagType: 'S/B',
      rentType: 'Seasonal',
      rentAmount: 13050,
    });

    const confirmations: Record<string, BagConfirmationValue> = {
      'grn-live-0010': {
        category: 'S/B',
        quantity: 10,
        smallBags: 10,
        bigBags: 0,
        seasonalBagPrice: '',
        monthlyBagPrice: '',
        bagPrice: '',
      },
      'grn-live-0012': {
        category: 'S/B',
        quantity: 12,
        smallBags: 12,
        bigBags: 0,
        seasonalBagPrice: '',
        monthlyBagPrice: '',
        bagPrice: '',
      },
    };

    const calc0010 = calculateMergeSourceRentSummary({
      source: liveGrn0010,
      confirmation: confirmations['grn-live-0010'],
      movementDate: '2026-10-23',
      targetGrnDate: new Date('2026-10-20'),
      commodityHamaliRate: 25,
    });

    expect(calc0010.totalRent).toBe(26100);
    expect(calc0010.hamaliAmount).toBe(250); // 10 bags @ ₹25
    expect(calc0010.totalAmountToPay).toBe(26350);

    const calc0012 = calculateMergeSourceRentSummary({
      source: liveGrn0012,
      confirmation: confirmations['grn-live-0012'],
      movementDate: '2026-10-23',
      targetGrnDate: new Date('2026-10-20'),
      commodityHamaliRate: 25,
    });

    expect(calc0012.totalRent).toBe(13050);
    expect(calc0012.hamaliAmount).toBe(300); // 12 bags @ ₹25
    expect(calc0012.totalAmountToPay).toBe(13350);

    const grandTotal = calculateMergeGrandTotal({
      selectedSources: [liveGrn0010, liveGrn0012],
      sourceConfirmations: confirmations,
      movementDate: '2026-10-23',
      targetGrnDate: new Date('2026-10-20'),
      commodityHamaliRate: 25,
    });
    // Storage Rent + Hamali = 26,350 + 13,350 = 39,700
    expect(grandTotal).toBe(39700);
  });
});
