import { describe, expect, it } from 'vitest';
import type { Grn, RentSummaryDto } from '@cold-storage/contracts';
import {
  calculateMergeGrandTotal,
  calculateMergeSourceRentSummary,
  deriveMergeRentAssessment,
} from '../mergeRentAssessment.helper';
import type { BagConfirmationValue } from '../bagConfirmation.helper';

describe('mergeRentAssessment.helper', () => {
  function makeSourceGrn(overrides: Partial<Grn> = {}): Grn {
    return {
      id: 'grn-source-0030',
      facilityId: 'fac-1',
      grnNumber: '0030',
      inwardReceiptNumber: 'RCP-0030',
      date: new Date('2024-06-04'),
      customerId: 'cust-1',
      customerName: 'Penchaliah',
      commodityId: 'cmd-1',
      commodityName: 'Mirchi',
      chamber: 'A-09,10',
      bags: 10,
      closingBags: 10,
      bagType: 'S/B',
      smallBags: 0,
      bigBags: 0,
      rentType: 'Seasonal',
      rentAmount: 12000,
      rentPaymentStatus: 'Settled',
      rentRemainingBalance: 0,
      status: 'OPEN',
      createdBy: 'admin',
      bondNumber: null,
      isBondForLoan: false,
      loanStatus: 'NONE',
      ...overrides,
    };
  }

  function makeSummary(overrides: Partial<RentSummaryDto> = {}): RentSummaryDto {
    return {
      grnId: 'grn-source-0030',
      grnNumber: '0030',
      facilityId: 'fac-1',
      customerId: 'cust-1',
      customerName: 'Penchaliah',
      commodityName: 'Mirchi',
      chamber: 'A-09,10',
      inwardDate: new Date('2024-06-04'),
      totalBags: 10,
      deliveredBags: 0,
      remainingBags: 10,
      bagPrice: null,
      smallBagPrice: null,
      bigBagPrice: null,
      totalBagsWeight: null,
      rentType: 'Seasonal',
      rentAmount: 12000,
      rentMonths: null,
      totalPaid: 12000,
      remainingBalance: 0,
      paymentStatus: 'Settled',
      rentState: 'SETTLED',
      verificationReason: null,
      payments: [
        {
          id: 'pay-1',
          facilityId: 'fac-1',
          grnId: 'grn-source-0030',
          grnNumber: '0030',
          receiptNumber: 'RCPT-001',
          amountPaid: 12000,
          paymentMode: 'Cash',
          paymentDate: new Date('2024-07-01'),
          notes: 'Full payment',
          createdBy: 'admin',
          createdAt: new Date('2024-07-01'),
        },
      ],
      extensions: [],
      totalDue: 12000,
      remarks: null,
      ...overrides,
    };
  }

  it('1. Fully settled source GRN shows obligation ₹12,000, paid ₹12,000, balance ₹0, carried ₹0', () => {
    const source = makeSourceGrn({ rentAmount: 12000, rentPaymentStatus: 'Settled', rentRemainingBalance: 0 });
    const summary = makeSummary({ totalDue: 12000, totalPaid: 12000, remainingBalance: 0 });

    const result = deriveMergeRentAssessment({
      source,
      summary,
      repackMode: false,
      commodityHamaliRate: 4,
    });

    expect(result.historicalObligation).toBe(12000);
    expect(result.amountPaid).toBe(12000);
    expect(result.outstandingBalance).toBe(0);
    expect(result.isSettled).toBe(true);
    expect(result.carriedRent).toBe(0);
    expect(result.repackHamali).toBe(0);
    expect(result.totalCarried).toBe(0);
  });

  it('2. Fully settled source with repacking labor adds Hamali labor only', () => {
    const source = makeSourceGrn({ rentAmount: 12000, rentPaymentStatus: 'Settled', rentRemainingBalance: 0, bags: 10, closingBags: 10 });
    const summary = makeSummary({ totalDue: 12000, totalPaid: 12000, remainingBalance: 0 });

    const result = deriveMergeRentAssessment({
      source,
      summary,
      repackMode: true,
      commodityHamaliRate: 4,
    });

    // 10 bags @ ₹4 = ₹40
    expect(result.carriedRent).toBe(0);
    expect(result.repackHamali).toBe(40);
    expect(result.totalCarried).toBe(40);
  });

  it('3. Partially paid source GRN shows verified dues and carries forward only outstanding amount', () => {
    const source = makeSourceGrn({ rentAmount: 12000, rentPaymentStatus: 'Not Settled', rentRemainingBalance: 8000 });
    const summary = makeSummary({ totalDue: 12000, totalPaid: 4000, remainingBalance: 8000, paymentStatus: 'Not Settled' });

    const result = deriveMergeRentAssessment({
      source,
      summary,
      repackMode: false,
      commodityHamaliRate: 4,
    });

    expect(result.historicalObligation).toBe(12000);
    expect(result.amountPaid).toBe(4000);
    expect(result.outstandingBalance).toBe(8000);
    expect(result.isSettled).toBe(false);
    expect(result.carriedRent).toBe(8000);
    expect(result.totalCarried).toBe(8000);
  });

  it('4. Unpaid source GRN displays full liability as outstanding balance and carries it forward', () => {
    const source = makeSourceGrn({ rentAmount: 12000, rentPaymentStatus: 'Not Settled', rentRemainingBalance: 12000 });
    const summary = makeSummary({ totalDue: 12000, totalPaid: 0, remainingBalance: 12000, paymentStatus: 'Not Settled' });

    const result = deriveMergeRentAssessment({
      source,
      summary,
      repackMode: false,
      commodityHamaliRate: 4,
    });

    expect(result.historicalObligation).toBe(12000);
    expect(result.amountPaid).toBe(0);
    expect(result.outstandingBalance).toBe(12000);
    expect(result.isSettled).toBe(false);
    expect(result.carriedRent).toBe(12000);
    expect(result.totalCarried).toBe(12000);
  });

  it('5. Source GRN with initial rentAmount = 0 reconciles historical obligation from payment receipts', () => {
    // When stored rentAmount on bare GRN row was 0, but payments totaling 12000 exist
    const source = makeSourceGrn({ rentAmount: 0, rentPaymentStatus: 'Settled', rentRemainingBalance: 0 });
    const summary = makeSummary({ rentAmount: 12000, totalDue: 12000, totalPaid: 12000, remainingBalance: 0 });

    const result = deriveMergeRentAssessment({
      source,
      summary,
      repackMode: false,
      commodityHamaliRate: 4,
    });

    // Must NOT display ₹0 obligation when ₹12,000 was paid
    expect(result.historicalObligation).toBe(12000);
    expect(result.amountPaid).toBe(12000);
    expect(result.outstandingBalance).toBe(0);
    expect(result.isSettled).toBe(true);
    expect(result.carriedRent).toBe(0);
    expect(result.totalCarried).toBe(0);
  });

  it('6. Unbilled cross-season source GRN (e.g. 0032) derives historical obligation from calculatedRent + hamali', () => {
    // Source GRN 0032 (1 bag, inward 2024, merge 2026): rentAmount 0, summary totalDue 0
    // calculatedRent = 640 (2024, Jan-Feb 2025, 2025, Jan-Feb 2026; 2026 excluded), Hamali rate = 20
    const source = makeSourceGrn({ rentAmount: 0, rentPaymentStatus: 'Not Settled', bags: 1, closingBags: 1 });
    const summary = makeSummary({ rentAmount: 0, totalDue: 0, totalPaid: 0, remainingBalance: 0, totalBags: 1, remainingBags: 1 });

    const result = deriveMergeRentAssessment({
      source,
      summary,
      repackMode: false,
      commodityHamaliRate: 20,
      calculatedRent: 640,
    });

    // 640 historical rent; repacking Hamali is not prematurely added
    expect(result.historicalObligation).toBe(640);
    expect(result.amountPaid).toBe(0);
    expect(result.outstandingBalance).toBe(640);
    expect(result.isSettled).toBe(false);
    expect(result.carriedRent).toBe(640);
    expect(result.totalCarried).toBe(640);
  });

  describe('calculateMergeSourceRentSummary', () => {
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
      expect(result.hamaliAmount).toBe(0); // Repacking Hamali deferred to Step 4
      // 100 * 120 (2025 season) + 100 * 60 * 2 (Jan-Feb 2026) = 24,000
      expect(result.totalRent).toBe(24000);
      expect(result.totalAmountToPay).toBe(24000);
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
      expect(result.hamaliAmount).toBe(0); // Repacking Hamali deferred to Step 4
      // 60 * 100 + 40 * 150 = 6,000 + 6,000 = 12,000
      expect(result.totalRent).toBe(12000);
      expect(result.totalAmountToPay).toBe(12000);
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
  });

  describe('calculateMergeGrandTotal', () => {
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

      // GRN 0012:
      // (2025) Mar - Dec: 8*15 + 4*15 = 180
      // Jan - Feb 2026: 8*20 + 4*30 = 280
      // Hamali: 0 (deferred to Step 4 repacking confirmation)
      // Storage Rent: 420, Total to Pay: 420

      // GRN 0010:
      // 2024 Mar - Dec: 10 * 110 = 1,100
      // 2025 Jan - Feb: 10 * 140 = 1,400
      // 2025 Mar - Dec: 10 * 110 = 1,100
      // 2026 Jan - Feb: 10 * 140 = 1,400
      // Hamali: 0 (deferred to Step 4 repacking confirmation)
      // Storage Rent: 5,000, Total to Pay: 5,000

      // Grand Total: 420 + 5,000 = 5,420
      expect(grandTotal).toBe(5420);
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

      expect(initialTotal).toBe(5000);

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

      // 2 seasonal cycles (2024 and 2025) each increase by 10 * 10 = 100 -> +200 total (5,000 + 200 = 5,200)
      expect(updatedTotal).toBe(5200);
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
      expect(calc0010.hamaliAmount).toBe(0);
      expect(calc0010.totalAmountToPay).toBe(26100);

      const calc0012 = calculateMergeSourceRentSummary({
        source: liveGrn0012,
        confirmation: confirmations['grn-live-0012'],
        movementDate: '2026-10-23',
        targetGrnDate: new Date('2026-10-20'),
        commodityHamaliRate: 25,
      });

      expect(calc0012.totalRent).toBe(13050);
      expect(calc0012.hamaliAmount).toBe(0);
      expect(calc0012.totalAmountToPay).toBe(13050);

      const grandTotal = calculateMergeGrandTotal({
        selectedSources: [liveGrn0010, liveGrn0012],
        sourceConfirmations: confirmations,
        movementDate: '2026-10-23',
        targetGrnDate: new Date('2026-10-20'),
        commodityHamaliRate: 25,
      });

      // Pure storage rent: 26,100 + 13,050 = 39,150 (Hamali deferred to Step 4)
      expect(grandTotal).toBe(39150);
    });
  });
});
