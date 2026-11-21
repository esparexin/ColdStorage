import { describe, expect, it } from 'vitest';
import { filterRentAccounts } from '../rentFilter.helper';
import { createStandardAccounts } from './rentFilter.test-fixtures';

describe('rentFilter.helper - status filtering', () => {
  const accounts = createStandardAccounts();

  it('filters by UNPAID status (zero paid with outstanding balance)', () => {
    const result = filterRentAccounts(accounts, {
      searchTerm: '',
      statusFilter: 'UNPAID',
      typeFilter: '',
    });
    expect(result).toHaveLength(1);
    expect(result[0].grnNumber).toBe('GRN-101');
  });

  it('filters by PARTIALLY_PAID status (partial payment with outstanding balance)', () => {
    const result = filterRentAccounts(accounts, {
      searchTerm: '',
      statusFilter: 'PARTIALLY_PAID',
      typeFilter: '',
    });
    expect(result).toHaveLength(1);
    expect(result[0].grnNumber).toBe('GRN-104');
  });

  it('filters by SETTLED status (payments made with zero remaining balance)', () => {
    const result = filterRentAccounts(accounts, {
      searchTerm: '',
      statusFilter: 'SETTLED',
      typeFilter: '',
    });
    expect(result).toHaveLength(1);
    expect(result[0].grnNumber).toBe('GRN-102');
  });

  it('filters by NO_DUES status (unbilled stock in storage with zero dues)', () => {
    const result = filterRentAccounts(accounts, {
      searchTerm: '',
      statusFilter: 'NO_DUES',
      typeFilter: '',
    });
    expect(result).toHaveLength(1);
    expect(result[0].grnNumber).toBe('GRN-103');
  });

  it('ensures status tabs are mutually exclusive and partition the accounts exactly', () => {
    const unpaid = filterRentAccounts(accounts, { searchTerm: '', statusFilter: 'UNPAID', typeFilter: '' });
    const partiallyPaid = filterRentAccounts(accounts, { searchTerm: '', statusFilter: 'PARTIALLY_PAID', typeFilter: '' });
    const settled = filterRentAccounts(accounts, { searchTerm: '', statusFilter: 'SETTLED', typeFilter: '' });
    const noDues = filterRentAccounts(accounts, { searchTerm: '', statusFilter: 'NO_DUES', typeFilter: '' });

    expect(unpaid.length + partiallyPaid.length + settled.length + noDues.length).toBe(accounts.length);
  });

  it('filters by PENDING_DUES status', () => {
    const result = filterRentAccounts(accounts, {
      searchTerm: '',
      statusFilter: 'PENDING_DUES',
      typeFilter: '',
    });
    expect(result).toHaveLength(2);
    expect(result.map((a) => a.grnNumber)).toEqual(['GRN-101', 'GRN-104']);
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
});
