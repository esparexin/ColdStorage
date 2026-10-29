import { describe, expect, it } from 'vitest';
import type { RentSummaryDto } from '@cold-storage/contracts';
import { filterRentAccounts, isClosedWithDuesRentAccount } from '../rentFilter.helper';

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

describe('CLOSED_WITH_DUES filter and helper', () => {
  it('isClosedWithDuesRentAccount returns true for zero-stock or merged source with positive remainingBalance', () => {
    const activeWithDues = createMockAccount({ remainingBags: 50, remainingBalance: 2000 });
    const zeroStockWithDues = createMockAccount({ remainingBags: 0, remainingBalance: 1500 });
    const mergedSourceWithDues = createMockAccount({
      remainingBags: 0,
      mergedIntoGrnNumber: 'GRN-0020',
      remainingBalance: 3000,
    });
    const zeroStockSettled = createMockAccount({ remainingBags: 0, remainingBalance: 0 });

    expect(isClosedWithDuesRentAccount(activeWithDues)).toBe(false);
    expect(isClosedWithDuesRentAccount(zeroStockWithDues)).toBe(true);
    expect(isClosedWithDuesRentAccount(mergedSourceWithDues)).toBe(true);
    expect(isClosedWithDuesRentAccount(zeroStockSettled)).toBe(false);
  });

  it('filters exclusively closed/zero-stock accounts with pending dues when statusFilter is CLOSED_WITH_DUES', () => {
    const zeroStockDues = createMockAccount({
      grnId: 'grn-closed-1',
      grnNumber: 'GRN-C1',
      remainingBags: 0,
      remainingBalance: 2500,
    });
    const zeroStockSettled = createMockAccount({
      grnId: 'grn-closed-2',
      grnNumber: 'GRN-C2',
      remainingBags: 0,
      remainingBalance: 0,
    });
    const activeDues = createMockAccount({
      grnId: 'grn-active-1',
      grnNumber: 'GRN-A1',
      remainingBags: 100,
      remainingBalance: 5000,
    });

    const list = [zeroStockDues, zeroStockSettled, activeDues];
    const results = filterRentAccounts(list, {
      searchTerm: '',
      statusFilter: 'CLOSED_WITH_DUES',
      typeFilter: '',
    });

    expect(results).toHaveLength(1);
    expect(results[0].grnNumber).toBe('GRN-C1');
  });
});
