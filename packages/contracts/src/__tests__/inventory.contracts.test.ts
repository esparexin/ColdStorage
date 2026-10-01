import { describe, expect, it } from 'vitest';
import {
  createPutAwaySchema,
  stockLedgerQuerySchema,
  putAwayStatusSchema,
  inventoryTransactionTypeSchema,
  inventoryReferenceTypeSchema,
} from '../inventory.js';

describe('P5 Inventory & Rack Allocation Contracts', () => {
  it('validates a valid createPutAway input', () => {
    const input = {
      items: [
        { positionId: 'pos-1', bags: 100 },
        { positionId: 'pos-2', bags: 50 },
      ],
      notes: 'Initial lot allocation',
    };
    const parsed = createPutAwaySchema.safeParse(input);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.items).toHaveLength(2);
      expect(parsed.data.items[0].bags).toBe(100);
    }
  });

  it('rejects duplicate positionIds in the same put-away request', () => {
    const input = {
      items: [
        { positionId: 'pos-1', bags: 100 },
        { positionId: 'pos-1', bags: 50 },
      ],
    };
    const parsed = createPutAwaySchema.safeParse(input);
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues[0].message).toContain('Duplicate positionId');
    }
  });

  it('rejects non-positive or fractional bag quantities in put-away', () => {
    expect(
      createPutAwaySchema.safeParse({
        items: [{ positionId: 'pos-1', bags: 0 }],
      }).success,
    ).toBe(false);

    expect(
      createPutAwaySchema.safeParse({
        items: [{ positionId: 'pos-1', bags: -5 }],
      }).success,
    ).toBe(false);

    expect(
      createPutAwaySchema.safeParse({
        items: [{ positionId: 'pos-1', bags: 10.5 }],
      }).success,
    ).toBe(false);
  });

  it('rejects empty allocation items array', () => {
    const parsed = createPutAwaySchema.safeParse({ items: [] });
    expect(parsed.success).toBe(false);
  });

  it('enforces strictly INWARD_PUTAWAY as transaction type', () => {
    expect(inventoryTransactionTypeSchema.safeParse('INWARD_PUTAWAY').success).toBe(true);
    expect(inventoryTransactionTypeSchema.safeParse('OUTWARD_DELIVERY').success).toBe(false);
    expect(inventoryTransactionTypeSchema.safeParse('INVENTORY_ADJUSTMENT').success).toBe(false);
  });

  it('enforces strictly PUT_AWAY as reference type', () => {
    expect(inventoryReferenceTypeSchema.safeParse('PUT_AWAY').success).toBe(true);
    expect(inventoryReferenceTypeSchema.safeParse('ADJUSTMENT').success).toBe(false);
  });

  it('validates putAwayStatusSchema vocabulary', () => {
    expect(putAwayStatusSchema.safeParse('UNALLOCATED').success).toBe(true);
    expect(putAwayStatusSchema.safeParse('PARTIALLY_ALLOCATED').success).toBe(true);
    expect(putAwayStatusSchema.safeParse('FULLY_ALLOCATED').success).toBe(true);
    expect(putAwayStatusSchema.safeParse('CLOSED').success).toBe(false);
  });

  it('parses stockLedgerQuery with default pagination', () => {
    const parsed = stockLedgerQuerySchema.safeParse({});
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.page).toBe(1);
      expect(parsed.data.limit).toBe(20);
    }
  });
});
