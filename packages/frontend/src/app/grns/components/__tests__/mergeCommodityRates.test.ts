import { describe, expect, it } from 'vitest';
import type { Commodity, Grn } from '@cold-storage/contracts';
import {
  calculateMergeGrandTotal,
  calculateMergeSourceRentSummary,
} from '../mergeRentAssessment.helper';

describe('Consignment Merge: Source GRN Commodity Rate Resolution', () => {
  const commodityWithRates: Commodity = {
    id: 'cmd-mirchi',
    name: 'Mirchi',
    rates: [
      {
        id: 'rate-seasonal',
        commodityId: 'cmd-mirchi',
        rentType: 'Seasonal',
        smallRate: 25,
        bigRate: 35,
        isActive: true,
      },
      {
        id: 'rate-monthly',
        commodityId: 'cmd-mirchi',
        rentType: 'Monthly',
        smallRate: 4,
        bigRate: 6,
        isActive: true,
      },
    ],
    isHamaliApplicable: true,
    hamaliRate: 5,
    isActive: true,
  };

  function makeSourceGrn(overrides: Partial<Grn> = {}): Grn {
    return {
      id: 'grn-source-1',
      facilityId: 'fac-1',
      grnNumber: '0050',
      inwardReceiptNumber: 'RCP-0050',
      date: new Date('2024-04-10'),
      customerId: 'cust-1',
      customerName: 'Penchaliah',
      commodityId: 'cmd-mirchi',
      commodityName: 'Mirchi',
      chamber: 'A-01',
      bags: 20,
      closingBags: 20,
      bagType: 'S/B',
      smallBags: 15,
      bigBags: 5,
      rentType: 'Seasonal',
      rentAmount: 0,
      status: 'OPEN',
      createdBy: 'admin',
      bondNumber: null,
      isBondForLoan: false,
      loanStatus: 'NONE',
      isCompositionVerified: true,
      ...overrides,
    };
  }

  it('resolves active Seasonal rates from commodity when source GRN has no agreed rates', () => {
    const source = makeSourceGrn({
      smallBagPrice: undefined,
      bigBagPrice: undefined,
      bagPrice: undefined,
    });

    // 15 Small @ ₹25 + 5 Big @ ₹35 = 375 + 175 = 550
    const calc = calculateMergeSourceRentSummary({
      source,
      movementDate: '2024-08-15',
      commodity: commodityWithRates,
    });

    expect(calc.totalRent).toBe(550);
    expect(calc.totalAmountToPay).toBe(550);
  });

  it('preserves agreed rates on source GRN over commodity rates', () => {
    const source = makeSourceGrn({
      smallBagPrice: 20,
      bigBagPrice: 30,
    });

    // 15 Small @ ₹20 + 5 Big @ ₹30 = 300 + 150 = 450
    const calc = calculateMergeSourceRentSummary({
      source,
      movementDate: '2024-08-15',
      commodity: commodityWithRates,
    });

    expect(calc.totalRent).toBe(450);
  });

  it('resolves extension months using commodity Monthly rates', () => {
    // Inward in 2024 season, movement in Jan 2025 (1 month extension after Dec 31)
    const source = makeSourceGrn({
      date: new Date('2024-04-10'),
      smallBagPrice: undefined,
      bigBagPrice: undefined,
    });

    // Base season: 15 * 25 + 5 * 35 = 550
    // Jan extension (1 mo): 15 * 4 + 5 * 6 = 60 + 30 = 90
    // Total = 640
    const calc = calculateMergeSourceRentSummary({
      source,
      movementDate: '2025-01-15',
      commodity: commodityWithRates,
    });

    expect(calc.totalRent).toBe(640);
  });

  it('calculates grand total across multiple sources matching their commodity rates', () => {
    const source1 = makeSourceGrn({
      id: 'source-1',
      bags: 10,
      closingBags: 10,
      smallBags: 10,
      bigBags: 0,
      smallBagPrice: undefined,
    });
    const source2 = makeSourceGrn({
      id: 'source-2',
      bags: 10,
      closingBags: 10,
      smallBags: 0,
      bigBags: 10,
      smallBagPrice: undefined,
    });

    // source1: 10 Small @ ₹25 = 250
    // source2: 10 Big @ ₹35 = 350
    // Grand total = 600
    const grandTotal = calculateMergeGrandTotal({
      selectedSources: [source1, source2],
      movementDate: '2024-08-15',
      commodities: [commodityWithRates],
    });

    expect(grandTotal).toBe(600);
  });
});
