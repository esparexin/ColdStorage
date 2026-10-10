import { describe, expect, it } from 'vitest';
import type { RentSummaryDto } from '@cold-storage/contracts';
import { filterRentAccounts } from '../rentFilter.helper';

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
    payments: [],
    extensions: [],
    totalDue: 4000,
    ...overrides,
  };
}

describe('rentFilter.helper', () => {
  const account1 = createMockAccount({
    grnId: 'grn-1',
    grnNumber: 'GRN-101',
    customerName: 'Kisan Traders',
    commodityName: 'Potato',
    chamber: 'CH-01',
    rentType: 'Seasonal',
    rentAmount: 4000,
    totalPaid: 0,
    remainingBalance: 4000,
    paymentStatus: 'Not Settled',
  });

  const account2 = createMockAccount({
    grnId: 'grn-2',
    grnNumber: 'GRN-102',
    customerName: 'Ramesh Agro',
    commodityName: 'Wheat',
    chamber: 'CH-02',
    rentType: 'Seasonal',
    rentAmount: 5000,
    totalPaid: 5000,
    remainingBalance: 0,
    paymentStatus: 'Settled',
    payments: [
      {
        id: 'rp-1',
        facilityId: 'fac-1',
        grnId: 'grn-2',
        grnNumber: 'GRN-102',
        receiptNumber: 'RCPT-26-27-0099',
        amountPaid: 5000,
        paymentMode: 'Cash',
        paymentDate: new Date('2026-03-05'),
        notes: null,
        createdBy: 'usr-1',
        createdAt: new Date('2026-03-05'),
      },
    ],
  });

  const account3 = createMockAccount({
    grnId: 'grn-3',
    grnNumber: 'GRN-103',
    customerName: 'Suresh Farms',
    commodityName: 'Onion',
    chamber: 'CH-03',
    rentType: 'Monthly',
    rentAmount: 0,
    totalPaid: 0,
    remainingBalance: 0,
    paymentStatus: 'Settled',
  });

  const accounts = [account1, account2, account3];

  it('returns all accounts when no filters are set', () => {
    const result = filterRentAccounts(accounts, {
      searchTerm: '',
      statusFilter: '',
      typeFilter: '',
    });
    expect(result).toHaveLength(3);
  });

  it('filters by search term matching customer name', () => {
    const result = filterRentAccounts(accounts, {
      searchTerm: 'Ramesh',
      statusFilter: '',
      typeFilter: '',
    });
    expect(result).toHaveLength(1);
    expect(result[0].customerName).toBe('Ramesh Agro');
  });

  it('filters by search term matching GRN number', () => {
    const result = filterRentAccounts(accounts, {
      searchTerm: '101',
      statusFilter: '',
      typeFilter: '',
    });
    expect(result).toHaveLength(1);
    expect(result[0].grnNumber).toBe('GRN-101');
  });

  it('filters by search term matching receipt number in payments', () => {
    const result = filterRentAccounts(accounts, {
      searchTerm: '0099',
      statusFilter: '',
      typeFilter: '',
    });
    expect(result).toHaveLength(1);
    expect(result[0].grnNumber).toBe('GRN-102');
  });

  it('filters by PENDING_DUES status', () => {
    const result = filterRentAccounts(accounts, {
      searchTerm: '',
      statusFilter: 'PENDING_DUES',
      typeFilter: '',
    });
    expect(result).toHaveLength(1);
    expect(result[0].grnNumber).toBe('GRN-101');
  });

  it('filters by SETTLED status (paid in full)', () => {
    const result = filterRentAccounts(accounts, {
      searchTerm: '',
      statusFilter: 'SETTLED',
      typeFilter: '',
    });
    expect(result).toHaveLength(1);
    expect(result[0].grnNumber).toBe('GRN-102');
  });

  it('filters by NO_DUES status (zero rent and zero balance)', () => {
    const result = filterRentAccounts(accounts, {
      searchTerm: '',
      statusFilter: 'NO_DUES',
      typeFilter: '',
    });
    expect(result).toHaveLength(1);
    expect(result[0].grnNumber).toBe('GRN-103');
  });

  it('filters by rent type', () => {
    const result = filterRentAccounts(accounts, {
      searchTerm: '',
      statusFilter: '',
      typeFilter: 'Monthly',
    });
    expect(result).toHaveLength(1);
    expect(result[0].grnNumber).toBe('GRN-103');
  });

  it('combines search term, status filter, and type filter', () => {
    const result = filterRentAccounts(accounts, {
      searchTerm: 'Potato',
      statusFilter: 'PENDING_DUES',
      typeFilter: 'Seasonal',
    });
    expect(result).toHaveLength(1);
    expect(result[0].grnNumber).toBe('GRN-101');

    const noMatch = filterRentAccounts(accounts, {
      searchTerm: 'Wheat',
      statusFilter: 'PENDING_DUES',
      typeFilter: 'Seasonal',
    });
    expect(noMatch).toHaveLength(0);
  });
});
