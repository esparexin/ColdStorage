import { describe, expect, it } from 'vitest';
import type { Grn, RentSummaryDto } from '@cold-storage/contracts';
import { deriveMergeRentAssessment } from '../mergeRentAssessment.helper';

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

    // 640 historical rent + 20 inward hamali = 660
    expect(result.historicalObligation).toBe(660);
    expect(result.amountPaid).toBe(0);
    expect(result.outstandingBalance).toBe(660);
    expect(result.isSettled).toBe(false);
    expect(result.carriedRent).toBe(660);
    expect(result.totalCarried).toBe(660);
  });
});
