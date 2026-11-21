import { describe, expect, it } from 'vitest';
import { filterRentAccounts, isMergedRentAccount } from '../rentFilter.helper';
import { createMockAccount, createStandardAccounts } from './rentFilter.test-fixtures';

describe('rentFilter.helper - search, type, and merged filters', () => {
  const accounts = createStandardAccounts();

  it('returns all accounts when no filters are set', () => {
    const result = filterRentAccounts(accounts, {
      searchTerm: '',
      statusFilter: '',
      typeFilter: '',
    });
    expect(result).toHaveLength(4);
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

  it('filters by rent type', () => {
    const result = filterRentAccounts(accounts, {
      searchTerm: '',
      statusFilter: '',
      typeFilter: 'Monthly',
    });
    expect(result).toHaveLength(1);
    expect(result[0].grnNumber).toBe('GRN-103');
  });

  it('filters by Seasonal_3M rent type', () => {
    const seasonal3mAccount = createMockAccount({
      grnId: 'grn-5',
      grnNumber: 'GRN-105',
      rentType: 'Seasonal_3M',
    });
    const result = filterRentAccounts([...accounts, seasonal3mAccount], {
      searchTerm: '',
      statusFilter: '',
      typeFilter: 'Seasonal_3M',
    });
    expect(result).toHaveLength(1);
    expect(result[0].grnNumber).toBe('GRN-105');
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

  describe('MERGED filter and helper', () => {
    it('isMergedRentAccount returns true for source merged account and target merged consignment', () => {
      const normalAcc = createMockAccount({ grnNumber: 'GRN-001' });
      const sourceMergedAcc = createMockAccount({
        grnNumber: 'GRN-0010',
        mergedIntoGrnNumber: '0013',
      });
      const targetMergedAcc = createMockAccount({
        grnNumber: 'GRN-0013',
        remarks: '[MERGE RECEIVED 2026-10-22] Merged +60 bags. Carried pending rent: ₹39700',
      });
      const structuredMergedAcc = createMockAccount({
        grnNumber: 'GRN-0014',
        remarks: null,
        mergedConsignment: {
          isMergedTarget: true,
          totalMergedAddedBags: 60,
          genesisBags: 14,
          genesisCustomerName: 'Balaji',
          totalCarriedRent: 0,
          totalSeparateSourceRent: 0,
          repackHamali: null,
          sources: [],
        },
      });

      expect(isMergedRentAccount(normalAcc)).toBe(false);
      expect(isMergedRentAccount(sourceMergedAcc)).toBe(true);
      expect(isMergedRentAccount(targetMergedAcc)).toBe(true);
      expect(isMergedRentAccount(structuredMergedAcc)).toBe(true);
    });

    it('filters exclusively merged accounts when statusFilter is MERGED', () => {
      const sourceMerged = createMockAccount({
        grnId: 'grn-10',
        grnNumber: '0010',
        mergedIntoGrnNumber: '0013',
      });
      const targetMerged = createMockAccount({
        grnId: 'grn-13',
        grnNumber: '0013',
        remarks: '[MERGE RECEIVED 2026-10-22] Merged +60 bags',
      });

      const mixedAccounts = [...accounts, sourceMerged, targetMerged];

      const mergedResults = filterRentAccounts(mixedAccounts, {
        searchTerm: '',
        statusFilter: 'MERGED',
        typeFilter: '',
      });

      expect(mergedResults).toHaveLength(2);
      expect(mergedResults.map((a) => a.grnNumber)).toEqual(['0010', '0013']);
    });
  });
});
