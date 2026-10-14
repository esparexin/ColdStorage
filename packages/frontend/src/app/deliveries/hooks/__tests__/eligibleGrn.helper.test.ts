import { describe, expect, it } from 'vitest';
import type { Grn } from '@cold-storage/contracts';
import {
  INWARD_STOCK_PAGE_SIZE,
  calculateRemainingStock,
  clampBagAllocation,
  clearWithdrawalCounts,
  filterEligibleGrns,
  formatGrnDate,
  getAvailableStockBags,
  getEligibleGrnMarks,
  paginateEligibleGrns,
  resolveValidationStock,
} from '../eligibleGrn.helper';

function makeMockGrn(overrides: Partial<Grn> = {}): Grn {
  return {
    id: 'grn-1', facilityId: 'fac-1', grnNumber: '0011', date: new Date('2026-10-10'),
    customerId: 'cust-1', customerName: 'Kalyan', commodityId: 'cmd-mirchi',
    commodityName: 'Mirchi', chamber: 'a1-5,6', floor: '1', rack: 'A',
    bags: 1000, closingBags: 631, bagType: 'Standard', rentType: 'Seasonal',
    storageMark: 'pn-66', partyMark: 'pn-66', status: 'OPEN', loanStatus: 'NOT_TAKEN',
    smallBagPrice: 10, bigBagPrice: 20, receivedBy: 'admin',
    createdAt: new Date(), updatedAt: new Date(), ...overrides,
  } as Grn;
}

describe('eligibleGrn.helper', () => {
  describe('formatGrnDate', () => {
    it('returns em-dash for null, undefined, or empty string', () => {
      expect(formatGrnDate(null)).toBe('—');
      expect(formatGrnDate(undefined)).toBe('—');
      expect(formatGrnDate('')).toBe('—');
    });

    it('formats valid Date object into Indian locale format', () => {
      const formatted = formatGrnDate(new Date('2026-10-10T00:00:00.000Z'));
      expect(formatted).toMatch(/10 Oct 2026/);
    });

    it('formats valid ISO date string into Indian locale format', () => {
      const formatted = formatGrnDate('2026-10-10T00:00:00.000Z');
      expect(formatted).toMatch(/10 Oct 2026/);
    });

    it('returns raw string for unparseable dates', () => {
      expect(formatGrnDate('invalid-date-string')).toBe('invalid-date-string');
    });
  });

  describe('filterEligibleGrns', () => {
    const list: Grn[] = [
      makeMockGrn({ id: 'g-1', grnNumber: '0011', customerName: 'Kalyan', commodityName: 'Mirchi', chamber: 'a1-5,6', storageMark: 'pn-66', partyMark: 'pn-66' }),
      makeMockGrn({ id: 'g-2', grnNumber: 'GRN-26-27-0004', customerName: 'punnarao', commodityName: 'Tamarind', chamber: 'B5-09,10', storageMark: 'ppr', partyMark: 'ppr' }),
      makeMockGrn({ id: 'g-3', grnNumber: '0015', customerName: 'NITISH', commodityName: 'Mirchi', chamber: 'B-06,09', storageMark: 'Pench-Gudu', partyMark: 'Pench-Gudu' }),
    ];

    it('returns all items with stock when query is empty or whitespace', () => {
      expect(filterEligibleGrns(list, '')).toEqual(list);
      expect(filterEligibleGrns(list, '   ')).toEqual(list);
    });

    it('excludes consignments with zero or exhausted remaining stock', () => {
      const withExhausted = [...list, makeMockGrn({ id: 'g-zero', grnNumber: '0023', closingBags: 0 })];
      const result = filterEligibleGrns(withExhausted, '');
      expect(result).toHaveLength(3);
      expect(result.some((g) => g.id === 'g-zero')).toBe(false);
    });

    it('matches by GRN number case-insensitively', () => {
      expect(filterEligibleGrns(list, '0011')).toHaveLength(1);
    });

    it('matches by Customer name case-insensitively', () => {
      expect(filterEligibleGrns(list, 'PUNNA')).toHaveLength(1);
    });

    it('matches by Commodity name', () => {
      expect(filterEligibleGrns(list, 'Mirchi')).toHaveLength(2);
    });

    it('matches by Storage mark or Party mark', () => {
      expect(filterEligibleGrns(list, 'Pench')).toHaveLength(1);
    });

    it('matches by Chamber identifier', () => {
      expect(filterEligibleGrns(list, 'B5-09')).toHaveLength(1);
    });

    it('returns empty array when nothing matches', () => {
      expect(filterEligibleGrns(list, 'nonexistent-token')).toHaveLength(0);
    });
  });

  describe('paginateEligibleGrns', () => {
    const twentyGrns = Array.from({ length: 25 }, (_, i) =>
      makeMockGrn({ id: `grn-${i + 1}`, grnNumber: `GRN-${i + 1}` }),
    );

    it('paginates 25 items with pageSize 10 correctly on page 1', () => {
      const page1 = paginateEligibleGrns(twentyGrns, 1, 10);
      expect(page1.totalRecords).toBe(25);
      expect(page1.totalPages).toBe(3);
      expect(page1.safePage).toBe(1);
      expect(page1.items).toHaveLength(10);
      expect(page1.items[0].id).toBe('grn-1');
      expect(page1.items[9].id).toBe('grn-10');
    });

    it('paginates correctly on page 2', () => {
      const page2 = paginateEligibleGrns(twentyGrns, 2, 10);
      expect(page2.safePage).toBe(2);
      expect(page2.items).toHaveLength(10);
      expect(page2.items[0].id).toBe('grn-11');
      expect(page2.items[9].id).toBe('grn-20');
    });

    it('paginates final page 3 with remainder items', () => {
      const page3 = paginateEligibleGrns(twentyGrns, 3, 10);
      expect(page3.safePage).toBe(3);
      expect(page3.items).toHaveLength(5);
      expect(page3.items[0].id).toBe('grn-21');
      expect(page3.items[4].id).toBe('grn-25');
    });

    it('clamps out-of-bounds page numbers safely', () => {
      const clampedHigh = paginateEligibleGrns(twentyGrns, 999, 10);
      expect(clampedHigh.safePage).toBe(3);
      expect(clampedHigh.items).toHaveLength(5);

      const clampedLow = paginateEligibleGrns(twentyGrns, -5, 10);
      expect(clampedLow.safePage).toBe(1);
      expect(clampedLow.items).toHaveLength(10);
    });

    it('handles empty input gracefully', () => {
      const emptyResult = paginateEligibleGrns([], 1, 10);
      expect(emptyResult.totalRecords).toBe(0);
      expect(emptyResult.totalPages).toBe(1);
      expect(emptyResult.safePage).toBe(1);
      expect(emptyResult.items).toHaveLength(0);
    });

    it('uses default INWARD_STOCK_PAGE_SIZE = 10', () => {
      expect(INWARD_STOCK_PAGE_SIZE).toBe(10);
      const res = paginateEligibleGrns(twentyGrns, 1);
      expect(res.items).toHaveLength(10);
    });
  });

  describe('getEligibleGrnMarks', () => {
    it('returns storageMark as primaryMark and leaves partyMarkSub undefined when identical', () => {
      const grn = makeMockGrn({ storageMark: 'MARK-1', partyMark: 'MARK-1' });
      expect(getEligibleGrnMarks(grn)).toEqual({
        primaryMark: 'MARK-1',
        partyMarkSub: undefined,
      });
    });

    it('returns partyMarkSub when partyMark is distinct from storageMark', () => {
      const grn = makeMockGrn({ storageMark: 'STORE-A', partyMark: 'PARTY-B' });
      expect(getEligibleGrnMarks(grn)).toEqual({
        primaryMark: 'STORE-A',
        partyMarkSub: 'PARTY-B',
      });
    });

    it('falls back to grnNumber when storageMark is missing', () => {
      const grn = makeMockGrn({ storageMark: undefined, partyMark: undefined, grnNumber: '9988' });
      expect(getEligibleGrnMarks(grn)).toEqual({
        primaryMark: '9988',
        partyMarkSub: undefined,
      });
    });
  });

  describe('getAvailableStockBags', () => {
    it('returns closingBags when present', () => {
      const grn = makeMockGrn({ bags: 1000, closingBags: 631 });
      expect(getAvailableStockBags(grn)).toBe(631);
    });

    it('falls back to inward bags when closingBags is undefined or null', () => {
      const grn = makeMockGrn({ bags: 850, closingBags: undefined });
      expect(getAvailableStockBags(grn)).toBe(850);
    });

    it('clamps negative or zero bags to 0', () => {
      expect(getAvailableStockBags(makeMockGrn({ closingBags: 0 }))).toBe(0);
      expect(getAvailableStockBags(makeMockGrn({ closingBags: -5 }))).toBe(0);
    });
  });

  describe('calculateRemainingStock', () => {
    it('calculates remaining bags accurately', () => {
      expect(calculateRemainingStock(100, 20, 30)).toBe(50);
      expect(calculateRemainingStock(100, 0, 0)).toBe(100);
      expect(calculateRemainingStock(100, 60, 40)).toBe(0);
    });

    it('clamps to zero if entered quantity exceeds total', () => {
      expect(calculateRemainingStock(100, 100, 80)).toBe(0);
    });
  });

  describe('clampBagAllocation', () => {
    it('allows valid entries within remaining balance', () => {
      expect(clampBagAllocation(20, 30, 100)).toBe(20);
      expect(clampBagAllocation(50, 50, 100)).toBe(50);
    });

    it('strictly clamps to remaining balance when typed number exceeds limit', () => {
      // 100 total, 40 in other field -> max allowed is 60. User types 80 -> clamped to 60.
      expect(clampBagAllocation(80, 40, 100)).toBe(60);
    });

    it('blocks increase when remaining balance is 0', () => {
      // 100 total, 100 in other field -> max allowed is 0. User types 10 -> clamped to 0.
      expect(clampBagAllocation(10, 100, 100)).toBe(0);
    });

    it('handles negative or invalid values by returning 0', () => {
      expect(clampBagAllocation(-5, 0, 100)).toBe(0);
      expect(clampBagAllocation(NaN, 0, 100)).toBe(0);
    });

    it('respects segregated pool category caps', () => {
      // 100 total, 0 in other field, but small pool max is 30 -> user types 50 -> clamped to 30
      expect(clampBagAllocation(50, 0, 100, 30)).toBe(30);
    });
  });

  describe('clearWithdrawalCounts + resolveValidationStock (F3/F4)', () => {
    it('clears entered counts, keeps ceilings', () => {
      expect(clearWithdrawalCounts({ availableSmall: 60, availableBig: 40, smallBags: 10, bigBags: 5, quantity: 30 }))
        .toEqual({ availableSmall: 60, availableBig: 40, smallBags: '', bigBags: '', quantity: '' });
    });
    it('prefers summary balances, falls back pre-load', () => {
      expect(resolveValidationStock({ availableSmallBags: 60, availableBigBags: 40 }, { availableSmall: 100, availableBig: 100 }))
        .toEqual({ availableSmall: 60, availableBig: 40 });
      expect(resolveValidationStock(null, { availableSmall: 100, availableBig: 100 }))
        .toEqual({ availableSmall: 100, availableBig: 100 });
    });
  });
});

