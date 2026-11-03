import { describe, expect, it } from 'vitest';
import type { RentSummaryDto } from '@cold-storage/contracts';
import { isBilledRentAccount } from '../rentFilter.helper';

function createMockAccount(overrides: Partial<RentSummaryDto> = {}): RentSummaryDto {
  return {
    grnId: 'grn-1',
    grnNumber: 'GRN-101',
    facilityId: 'fac-1',
    customerId: 'cust-1',
    customerName: 'Kisan Traders',
    commodityName: 'Potato',
    chamber: 'CH-01',
    inwardDate: new Date('2026-03-01'),
    totalBags: 100,
    deliveredBags: 40,
    remainingBags: 60,
    bagPrice: 40,
    rentType: 'Seasonal',
    rentAmount: 4000,
    rentMonths: 10,
    totalPaid: 0,
    remainingBalance: 4000,
    paymentStatus: 'Not Settled',
    rentState: 'PENDING',
    payments: [],
    extensions: [],
    totalDue: 4000,
    ...overrides,
  };
}

describe('isBilledRentAccount', () => {
  it('returns false for unbilled active storage lots with zero dues and zero rent', () => {
    const unbilled = createMockAccount({
      rentAmount: 0,
      totalDue: 0,
      totalPaid: 0,
      remainingBalance: 0,
      paymentStatus: 'Settled',
      rentState: 'UNBILLED',
    });
    expect(isBilledRentAccount(unbilled)).toBe(false);
  });

  it('returns true for accounts with generated dues (Unpaid)', () => {
    const unpaid = createMockAccount({
      rentAmount: 18240,
      totalDue: 18240,
      totalPaid: 0,
      remainingBalance: 18240,
      paymentStatus: 'Not Settled',
      rentState: 'PENDING',
    });
    expect(isBilledRentAccount(unpaid)).toBe(true);
  });

  it('returns true for accounts with partial payments', () => {
    const partial = createMockAccount({
      rentAmount: 5000,
      totalPaid: 2000,
      remainingBalance: 3000,
      paymentStatus: 'Not Settled',
    });
    expect(isBilledRentAccount(partial)).toBe(true);
  });

  it('returns true for settled accounts with payment history', () => {
    const settled = createMockAccount({
      rentAmount: 5000,
      totalPaid: 5000,
      remainingBalance: 0,
      paymentStatus: 'Settled',
      rentState: 'SETTLED',
    });
    expect(isBilledRentAccount(settled)).toBe(true);
  });
});
