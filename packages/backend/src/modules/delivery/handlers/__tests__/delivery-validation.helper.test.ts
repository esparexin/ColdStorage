import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type mongoose from 'mongoose';
import {
  validateDeliveryDate,
  validateStockAndBalances,
  resolveSafeLedgerDrawdown,
} from '../delivery-validation.helper.js';
import * as ledgerBalanceModule from '../../../inventory/ledger-balance.js';

describe('validateDeliveryDate - Delivery Date & Chronological Invariants', () => {
  const originalEnv = process.env.ALLOW_HISTORICAL_TESTING_DATES;

  beforeEach(() => {
    delete process.env.ALLOW_HISTORICAL_TESTING_DATES;
  });

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.ALLOW_HISTORICAL_TESTING_DATES = originalEnv;
    } else {
      delete process.env.ALLOW_HISTORICAL_TESTING_DATES;
    }
  });

  it('1. rejects delivery date that precedes inward receipt date', () => {
    process.env.ALLOW_HISTORICAL_TESTING_DATES = 'true';
    const inwardDate = new Date('2024-08-12T00:00:00.000Z');
    const earlierDelivery = new Date('2024-08-01T00:00:00.000Z');

    expect(() => validateDeliveryDate(earlierDelivery, inwardDate)).toThrow(
      'Delivery date cannot be earlier than Inward date',
    );
  });

  it('2. accepts delivery date on the exact same date as inward receipt', () => {
    process.env.ALLOW_HISTORICAL_TESTING_DATES = 'true';
    const sameDate = new Date('2024-08-12T00:00:00.000Z');
    const result = validateDeliveryDate(sameDate, sameDate);
    expect(result.toISOString()).toBe(sameDate.toISOString());
  });

  it('3. accepts delivery date after inward receipt date', () => {
    process.env.ALLOW_HISTORICAL_TESTING_DATES = 'true';
    const inwardDate = new Date('2024-08-12T00:00:00.000Z');
    const laterDelivery = new Date('2024-10-15T00:00:00.000Z');
    const result = validateDeliveryDate(laterDelivery, inwardDate);
    expect(result.toISOString()).toBe(laterDelivery.toISOString());
  });

  it('4. accepts delivery date when inwardDate is omitted', () => {
    process.env.ALLOW_HISTORICAL_TESTING_DATES = 'true';
    const deliveryDate = new Date('2024-10-15T00:00:00.000Z');
    const result = validateDeliveryDate(deliveryDate);
    expect(result.toISOString()).toBe(deliveryDate.toISOString());
  });
});

describe('validateStockAndBalances - Inventory Availability Bounds & Bag Types', () => {
  const mockSession = {} as mongoose.ClientSession;
  const facilityId = 'fac-1';

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('rejects when requested total exceeds available balance', async () => {
    vi.spyOn(ledgerBalanceModule, 'readLedgerBalance').mockResolvedValue({
      smallBags: 40,
      bigBags: 60,
      total: 100,
    });

    const grn = { id: 'grn-1', grnNumber: 'GRN-001', bagType: 'S/B' };
    const withdrawal = { smallBags: 60, bigBags: 50 };

    await expect(
      validateStockAndBalances(facilityId, grn, withdrawal, mockSession),
    ).rejects.toThrow(/exceeds the available balance of 40 small and 60 big bags/);
  });

  it('enforces per-pool restrictions on segregated S/B lots', async () => {
    vi.spyOn(ledgerBalanceModule, 'readLedgerBalance').mockResolvedValue({
      smallBags: 30,
      bigBags: 70,
      total: 100,
    });

    const grn = { id: 'grn-1', grnNumber: 'GRN-001', bagType: 'S/B' };

    // Requesting 40 small bags when only 30 exist
    await expect(
      validateStockAndBalances(facilityId, grn, { smallBags: 40, bigBags: 10 }, mockSession),
    ).rejects.toThrow(/Requested 40 small and 10 big bags exceeds the available balance of 30 small and 70 big bags/);

    // Requesting 80 big bags when only 70 exist
    await expect(
      validateStockAndBalances(facilityId, grn, { smallBags: 10, bigBags: 80 }, mockSession),
    ).rejects.toThrow(/Requested 10 small and 80 big bags exceeds the available balance of 30 small and 70 big bags/);

    // Requesting valid quantities within pools
    const valid = await validateStockAndBalances(
      facilityId,
      grn,
      { smallBags: 20, bigBags: 50 },
      mockSession,
    );
    expect(valid).toEqual({ smallBags: 30, bigBags: 70, total: 100 });
  });

  it('rejects big bags on single-type Small (S) lots', async () => {
    vi.spyOn(ledgerBalanceModule, 'readLedgerBalance').mockResolvedValue({
      smallBags: 100,
      bigBags: 0,
      total: 100,
    });

    const grn = { id: 'grn-s', grnNumber: 'GRN-S-01', bagType: 'S' };

    await expect(
      validateStockAndBalances(facilityId, grn, { smallBags: 10, bigBags: 5 }, mockSession),
    ).rejects.toThrow(/exceeds available balance for single-type Small GRN/);

    // Valid S withdrawal
    const valid = await validateStockAndBalances(
      facilityId,
      grn,
      { smallBags: 20, bigBags: 0 },
      mockSession,
    );
    expect(valid.total).toBe(100);
  });

  it('rejects small bags on single-type Big (B) lots', async () => {
    vi.spyOn(ledgerBalanceModule, 'readLedgerBalance').mockResolvedValue({
      smallBags: 0,
      bigBags: 100,
      total: 100,
    });

    const grn = { id: 'grn-b', grnNumber: 'GRN-B-01', bagType: 'B' };

    await expect(
      validateStockAndBalances(facilityId, grn, { smallBags: 5, bigBags: 10 }, mockSession),
    ).rejects.toThrow(/exceeds available balance for single-type Big GRN/);

    // Valid B withdrawal
    const valid = await validateStockAndBalances(
      facilityId,
      grn,
      { smallBags: 0, bigBags: 20 },
      mockSession,
    );
    expect(valid.total).toBe(100);
  });

  it('enforces per-side limits on Hybrid lots when explicit bag composition is provided', async () => {
    vi.spyOn(ledgerBalanceModule, 'readLedgerBalance').mockResolvedValue({
      smallBags: 40,
      bigBags: 60,
      total: 100,
    });

    const grn = { id: 'grn-h', grnNumber: 'GRN-HYBRID-01', bagType: 'HYBRID' };

    // Requesting 45 small bags when only 40 are available
    await expect(
      validateStockAndBalances(
        facilityId,
        grn,
        { smallBags: 45, bigBags: 20 },
        mockSession,
        true, // isHybrid
        65,
        true, // hasSpecificBags
      ),
    ).rejects.toThrow(/Requested 45 small and 20 big bags exceeds the available balance of 40 small and 60 big bags/);

    // Requesting 65 big bags when only 60 are available
    await expect(
      validateStockAndBalances(
        facilityId,
        grn,
        { smallBags: 10, bigBags: 65 },
        mockSession,
        true, // isHybrid
        75,
        true, // hasSpecificBags
      ),
    ).rejects.toThrow(/Requested 10 small and 65 big bags exceeds the available balance of 40 small and 60 big bags/);

    // Valid explicit hybrid withdrawal preserves counts exactly
    const withdrawal = { smallBags: 25, bigBags: 35 };
    const res = await validateStockAndBalances(
      facilityId,
      grn,
      withdrawal,
      mockSession,
      true,
      60,
      true,
    );
    expect(withdrawal.smallBags).toBe(25);
    expect(withdrawal.bigBags).toBe(35);
    expect(res.total).toBe(100);
  });
});

describe('resolveSafeLedgerDrawdown', () => {
  it('rejects cross-pool overdraw on segregated S/B lots', () => {
    expect(() =>
      resolveSafeLedgerDrawdown(false, 'S/B', 50, 20, { smallBags: 40, bigBags: 60 }),
    ).toThrow(/exceeds the available pools of 40 small and 60 big bags/);
  });

  it('allows exact drawdown when each side fits its segregated pool', () => {
    const res = resolveSafeLedgerDrawdown(false, 'S/B', 30, 40, { smallBags: 40, bigBags: 60 });
    expect(res).toEqual({ smallQuantity: 30, bigQuantity: 40 });
  });

  it('returns quantities unchanged for Hybrid', () => {
    const res = resolveSafeLedgerDrawdown(true, 'HYBRID', 25, 35, { smallBags: 40, bigBags: 60 });
    expect(res).toEqual({ smallQuantity: 25, bigQuantity: 35 });
  });

  it('balances ledger pools when unclassified genesis stock is present', () => {
    // Ledger has 19 small and 11 big (total 30). Challan requests 15 small and 15 big (total 30).
    const res = resolveSafeLedgerDrawdown(false, 'S/B', 15, 15, { smallBags: 19, bigBags: 11 }, true);
    expect(res).toEqual({ smallQuantity: 19, bigQuantity: 11 });
  });

  it('rejects when requested total exceeds available stock even with unclassified genesis stock', () => {
    expect(() =>
      resolveSafeLedgerDrawdown(false, 'S/B', 20, 15, { smallBags: 19, bigBags: 11 }, true),
    ).toThrow(/Requested 35 bags exceeds available stock of 30 bags/);
  });
});

