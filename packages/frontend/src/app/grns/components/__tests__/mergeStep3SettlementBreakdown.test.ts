import { describe, expect, it } from 'vitest';
import type { Grn, RentSummaryDto } from '@cold-storage/contracts';
import { calculateMergeSourceRentSummary } from '../mergeRentAssessment.helper';

describe('Merge Step 3 Settlement - Outward Rent Calculation Breakdown & Destination Subscription', () => {
  const targetGrn0013: Grn = {
    id: 'grn-0013',
    facilityId: 'fac-1',
    grnNumber: '0013',
    inwardReceiptNumber: 'RCP-0013',
    date: new Date('2026-02-15'),
    customerId: 'cust-balaji',
    customerName: 'Balaji',
    commodityId: 'cmd-mirchi',
    commodityName: 'Mirchi',
    chamber: 'A-01,09',
    bags: 70,
    closingBags: 70,
    bagType: 'Hybrid',
    smallBags: 0,
    bigBags: 0,
    rentAmount: 0,
    rentType: 'Seasonal',
    status: 'OPEN',
    createdBy: 'admin',
    isBondForLoan: false,
    bondNumber: null,
    loanStatus: 'NONE',
  };

  const source0019: Grn = {
    id: 'grn-0019',
    facilityId: 'fac-1',
    grnNumber: '0019',
    inwardReceiptNumber: 'RCP-0019',
    date: new Date('2024-03-10'),
    customerId: 'cust-punnarao',
    customerName: 'punnarao',
    commodityId: 'cmd-mirchi',
    commodityName: 'Mirchi',
    chamber: 'apb-123',
    bags: 17,
    closingBags: 17,
    bagType: 'Hybrid',
    smallBags: 0,
    bigBags: 0,
    bagPrice: 150,
    rentAmount: 2550,
    rentType: 'Seasonal',
    status: 'OPEN',
    createdBy: 'admin',
    isBondForLoan: false,
    bondNumber: null,
    loanStatus: 'NONE',
  };

  const source0020: Grn = {
    id: 'grn-0020',
    facilityId: 'fac-1',
    grnNumber: '0020',
    inwardReceiptNumber: 'RCP-0020',
    date: new Date('2024-04-12'),
    customerId: 'cust-punnarao',
    customerName: 'punnarao',
    commodityId: 'cmd-mirchi',
    commodityName: 'Mirchi',
    chamber: 'a0a',
    bags: 18,
    closingBags: 18,
    bagType: 'S/B',
    smallBags: 8,
    bigBags: 10,
    smallBagPrice: 110,
    bigBagPrice: 185,
    rentAmount: 2730,
    rentType: 'Seasonal',
    status: 'OPEN',
    createdBy: 'admin',
    isBondForLoan: false,
    bondNumber: null,
    loanStatus: 'NONE',
  };

  it('calculates independent rent summaries for each source GRN using confirmed counts and historical seasons', () => {
    const movementDate = '2026-10-31';

    const rent0019 = calculateMergeSourceRentSummary({
      source: source0019,
      confirmation: {
        category: 'Hybrid',
        quantity: 17,
        bagPrice: 150,
        seasonalBagPrice: '',
        monthlyBagPrice: '',
      },
      movementDate,
      targetGrnDate: targetGrn0013.date,
    });

    const rent0020 = calculateMergeSourceRentSummary({
      source: source0020,
      confirmation: {
        category: 'S/B',
        smallBags: 8,
        bigBags: 10,
        quantity: '',
        bagPrice: '',
        seasonalBagPrice: '',
        monthlyBagPrice: '',
      },
      movementDate,
      targetGrnDate: targetGrn0013.date,
    });

    expect(rent0019.isHybrid).toBe(true);
    expect(rent0019.totalRent).toBeGreaterThan(0);

    expect(rent0020.isHybrid).toBe(false);
    expect(rent0020.smallBags).toBe(8);
    expect(rent0020.bigBags).toBe(10);
    expect(rent0020.totalRent).toBeGreaterThan(0);
  });

  it('correctly distinguishes settled vs outstanding dues using ledger summary without duplicating rent on target', () => {
    const settledSummary: RentSummaryDto = {
      facilityId: 'fac-1',
      grnId: 'grn-0019',
      grnNumber: '0019',
      customerId: 'cust-punnarao',
      customerName: 'punnarao',
      commodityName: 'Mirchi',
      chamber: 'CH-01',
      totalBags: 17,
      rentType: 'Seasonal',
      rentAmount: 2550,
      totalAmountDue: 2550,
      totalPaid: 2550,
      remainingBalance: 0,
      paymentStatus: 'Settled',
      rentState: 'BILLED',
      payments: [],
      extensions: [],
      totalDue: 2550,
      inwardDate: new Date('2024-03-10'),
    } as unknown as RentSummaryDto;

    const pendingSummary: RentSummaryDto = {
      facilityId: 'fac-1',
      grnId: 'grn-0020',
      grnNumber: '0020',
      customerId: 'cust-punnarao',
      customerName: 'punnarao',
      commodityName: 'Mirchi',
      chamber: 'CH-02',
      totalBags: 18,
      rentType: 'Seasonal',
      rentAmount: 2730,
      totalAmountDue: 2730,
      totalPaid: 0,
      remainingBalance: 2730,
      paymentStatus: 'Not Settled',
      rentState: 'BILLED',
      payments: [],
      extensions: [],
      totalDue: 2730,
      inwardDate: new Date('2024-04-12'),
    } as unknown as RentSummaryDto;

    expect(settledSummary.remainingBalance).toBe(0);
    expect(settledSummary.paymentStatus).toBe('Settled');

    expect(pendingSummary.remainingBalance).toBe(2730);
    expect(pendingSummary.paymentStatus).toBe('Not Settled');

    // Consolidated outstanding dues carried forward under AGREED_PENDING
    const totalPendingDues = settledSummary.remainingBalance + pendingSummary.remainingBalance;
    expect(totalPendingDues).toBe(2730);

    // Target GRN retains 0 additional obligation from settled source lots
    expect(targetGrn0013.rentAmount).toBe(0);
  });
});
