import { describe, expect, it } from 'vitest';
import type { Grn, RentSummaryDto } from '@cold-storage/contracts';
import { deriveMergeRentAssessment } from '../mergeRentObligation.helper';

describe('mergeRentObligation.helper', () => {
  const sampleGrn: Grn = {
    id: 'grn-source-1',
    facilityId: 'fac-1',
    grnNumber: 'GRN-0010',
    date: new Date('2026-03-01'),
    customerId: 'cust-1',
    customerName: 'Test Farmer',
    commodityId: 'comm-1',
    commodityName: 'Potatoes',
    chamber: 'Chamber 1',
    bags: 100,
    closingBags: 100,
    smallBags: 50,
    bigBags: 50,
    bagType: 'S+B',
    rentType: 'Seasonal',
    rentAmount: 10000,
    status: 'OPEN',
    storageMark: 'LOT-1',
    partyMark: 'PM-1',
    loanStatus: 'NOT_TAKEN',
    bondNumber: 'BOND-0010',
    isBondForLoan: false,
    inwardReceiptNumber: 'IRN-0010',
    createdBy: 'user-admin',
    createdAt: new Date('2026-03-01'),
    updatedAt: new Date('2026-03-01'),
  };

  it('derives assessment when summary is provided with partial payment', () => {
    const summary: RentSummaryDto = {
      grnId: 'grn-source-1',
      grnNumber: 'GRN-0010',
      totalDue: 12000,
      totalPaid: 4000,
      remainingBalance: 8000,
      status: 'PARTIAL',
      paymentStatus: 'Partial',
      rentAmount: 12000,
    };

    const res = deriveMergeRentAssessment({
      source: sampleGrn,
      summary,
      repackMode: false,
      commodityHamaliRate: 0,
    });

    expect(res.historicalObligation).toBe(12000);
    expect(res.amountPaid).toBe(4000);
    expect(res.outstandingBalance).toBe(8000);
    expect(res.isSettled).toBe(false);
    expect(res.carriedRent).toBe(8000);
    expect(res.repackHamali).toBe(0);
    expect(res.totalCarried).toBe(8000);
  });

  it('calculates repack hamali charge when repackMode is true', () => {
    const res = deriveMergeRentAssessment({
      source: sampleGrn,
      summary: null,
      repackMode: true,
      commodityHamaliRate: 15,
      calculatedRent: 5000,
    });

    expect(res.historicalObligation).toBe(10000);
    expect(res.repackHamali).toBe(1500); // 100 bags * 15
    expect(res.totalCarried).toBe(10000 + 1500);
  });

  it('marks isSettled true when outstanding balance is 0', () => {
    const settledGrn: Grn = {
      ...sampleGrn,
      rentPaymentStatus: 'Settled',
      rentRemainingBalance: 0,
    };

    const res = deriveMergeRentAssessment({
      source: settledGrn,
      summary: null,
      repackMode: false,
      commodityHamaliRate: 0,
    });

    expect(res.isSettled).toBe(true);
    expect(res.outstandingBalance).toBe(0);
    expect(res.carriedRent).toBe(0);
  });
});
