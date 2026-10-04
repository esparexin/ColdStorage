import { describe, expect, it } from 'vitest';
import {
  facilityInventorySummarySchema,
  grnInventorySummarySchema,
  inventoryTransactionTypeSchema,
  putAwayStatusSchema,
  stockLedgerQuerySchema,
} from '../inventory.js';

describe('P5 Inventory Contracts', () => {

  describe('putAwayStatusSchema vocabulary', () => {
    it('accepts only UNALLOCATED and ALLOCATED', () => {
      expect(putAwayStatusSchema.safeParse('UNALLOCATED').success).toBe(true);
      expect(putAwayStatusSchema.safeParse('ALLOCATED').success).toBe(true);
      expect(putAwayStatusSchema.safeParse('PARTIALLY_ALLOCATED').success).toBe(false);
      expect(putAwayStatusSchema.safeParse('FULLY_ALLOCATED').success).toBe(false);
    });
  });

  describe('inventoryTransactionTypeSchema vocabulary', () => {
    it('is the canonical ledger event vocabulary', () => {
      expect(inventoryTransactionTypeSchema.options).toEqual([
        'INWARD_PUTAWAY',
        'OUTWARD_DELIVERY',
        'DELIVERY_REVERSAL',
      ]);
    });
  });

  describe('grnInventorySummarySchema', () => {
    const base = {
      grnId: 'grn-1',
      facilityId: 'fac-1',
      grnNumber: 'GRN-26-27-0001',
      chamber: 'A',
      totalBags: 100,
      allocatedBags: 100,
      unallocatedBags: 0,
      putAwayStatus: 'ALLOCATED',
    };

    it('accepts a fully allocated GRN', () => {
      expect(grnInventorySummarySchema.safeParse(base).success).toBe(true);
    });

    it('accepts an unallocated GRN', () => {
      const result = grnInventorySummarySchema.safeParse({
        ...base,
        allocatedBags: 0,
        unallocatedBags: 100,
        putAwayStatus: 'UNALLOCATED',
      });
      expect(result.success).toBe(true);
    });

    it('rejects a chamber longer than 20 characters', () => {
      expect(grnInventorySummarySchema.safeParse({ ...base, chamber: 'x'.repeat(21) }).success).toBe(
        false,
      );
    });

    it('rejects an empty chamber', () => {
      expect(grnInventorySummarySchema.safeParse({ ...base, chamber: '   ' }).success).toBe(false);
    });
  });

  describe('facilityInventorySummarySchema', () => {
    it('groups stock by commodity and free-text chamber', () => {
      const result = facilityInventorySummarySchema.safeParse({
        facilityId: 'fac-1',
        totalStockBags: 250,
        byCommodity: [{ commodityId: 'cmd-1', commodityName: 'Potato', totalBags: 250 }],
        byChamber: [
          { chamber: 'A', totalBags: 150 },
          { chamber: 'CH-01', totalBags: 100 },
        ],
      });
      expect(result.success).toBe(true);
    });

    it('rejects an over-length chamber label', () => {
      const result = facilityInventorySummarySchema.safeParse({
        facilityId: 'fac-1',
        totalStockBags: 10,
        byCommodity: [],
        byChamber: [{ chamber: 'y'.repeat(21), totalBags: 10 }],
      });
      expect(result.success).toBe(false);
    });
  });

  describe('stockLedgerQuerySchema', () => {
    it('filters by grn and free-text chamber', () => {
      const result = stockLedgerQuerySchema.safeParse({ grnId: 'grn-1', chamber: 'A' });
      expect(result.success).toBe(true);
    });

    it('caps the chamber filter at 20 characters', () => {
      expect(stockLedgerQuerySchema.safeParse({ chamber: 'z'.repeat(21) }).success).toBe(false);
    });

    it('applies page and limit defaults', () => {
      const result = stockLedgerQuerySchema.safeParse({});
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.page).toBe(1);
        expect(result.data.limit).toBe(20);
      }
    });
  });
});