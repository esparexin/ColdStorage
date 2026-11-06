import { describe, expect, it } from 'vitest';
import {
  validateTransferBagConfirmation,
  validateTransferRepack,
} from '../modules/internal-movement/handlers/transfer-ownership-validation.helper.js';

describe('Transfer Ownership Validation (Unit)', () => {
  describe('validateTransferBagConfirmation', () => {
    it('requires explicit confirmed Small and Big counts for unverified S/B lots', () => {
      expect(() =>
        validateTransferBagConfirmation(
          {
            grnId: 'grn-1',
            newCustomerId: 'cust-2',
            remarks: 'Transfer test',
          } as never,
          100,
          '1001',
          false,
        ),
      ).toThrow("Confirmed bag composition is required for transfer of GRN '1001' with unverified composition (100 bags)");
    });

    it('rejects S/B confirmation when sum of small and big does not reconcile to ledger stock', () => {
      expect(() =>
        validateTransferBagConfirmation(
          {
            grnId: 'grn-1',
            newCustomerId: 'cust-2',
            remarks: 'Transfer test',
            confirmedSmallBags: 60,
            confirmedBigBags: 30, // 90 !== 100
          } as never,
          100,
          '1001',
          true,
        ),
      ).toThrow("Confirmed transfer counts (60 small + 30 big = 90) must reconcile with available stock of 100 bags for GRN '1001'");
    });

    it('rejects negative or fractional confirmed counts', () => {
      expect(() =>
        validateTransferBagConfirmation(
          {
            grnId: 'grn-1',
            newCustomerId: 'cust-2',
            remarks: 'Transfer test',
            confirmedSmallBags: -5,
            confirmedBigBags: 105,
          } as never,
          100,
          '1001',
          true,
        ),
      ).toThrow('Confirmed bag counts must be whole non-negative numbers');

      expect(() =>
        validateTransferBagConfirmation(
          {
            grnId: 'grn-1',
            newCustomerId: 'cust-2',
            remarks: 'Transfer test',
            confirmedSmallBags: 50.5,
            confirmedBigBags: 49.5,
          } as never,
          100,
          '1001',
          true,
        ),
      ).toThrow('Confirmed bag counts must be whole non-negative numbers');
    });

    it('accepts accurately reconciled confirmed Small and Big counts', () => {
      expect(() =>
        validateTransferBagConfirmation(
          {
            grnId: 'grn-1',
            newCustomerId: 'cust-2',
            remarks: 'Transfer test',
            confirmedSmallBags: 70,
            confirmedBigBags: 30,
          } as never,
          100,
          '1001',
          true,
        ),
      ).not.toThrow();
    });

    it('rejects obsolete single-type options and instructs S/B split', () => {
      expect(() =>
        validateTransferBagConfirmation(
          {
            grnId: 'grn-1',
            newCustomerId: 'cust-2',
            remarks: 'Transfer test',
            sourceBagType: 'S',
          } as never,
          100,
          '1001',
          true,
        ),
      ).toThrow('Small-only and Big-only confirmation uses the Small & Big split');
    });

    it('validates Hybrid transfer requiring positive rates and quantity matching stock', () => {
      expect(() =>
        validateTransferBagConfirmation(
          {
            grnId: 'grn-1',
            newCustomerId: 'cust-2',
            remarks: 'Transfer test',
            sourceBagType: 'Hybrid',
            sourceQuantity: 90,
            sourceBagPrice: 25,
          } as never,
          100,
          '1001',
          true,
        ),
      ).toThrow("Confirmed Hybrid quantity (90) must match available stock of 100 bags for GRN '1001'");

      expect(() =>
        validateTransferBagConfirmation(
          {
            grnId: 'grn-1',
            newCustomerId: 'cust-2',
            remarks: 'Transfer test',
            sourceBagType: 'Hybrid',
            sourceQuantity: 100,
          } as never,
          100,
          '1001',
          true,
        ),
      ).toThrow('Confirmed Hybrid lots require a per-bag rate');

      expect(() =>
        validateTransferBagConfirmation(
          {
            grnId: 'grn-1',
            newCustomerId: 'cust-2',
            remarks: 'Transfer test',
            sourceBagType: 'Hybrid',
            sourceQuantity: 100,
            sourceBagPrice: 30,
          } as never,
          100,
          '1001',
          true,
        ),
      ).not.toThrow();
    });
  });

  describe('validateTransferRepack', () => {
    it('requires repacked counts to reconcile to total stock', () => {
      expect(() =>
        validateTransferRepack(
          {
            grnId: 'grn-1',
            newCustomerId: 'cust-2',
            remarks: 'Transfer test',
            resultingBagType: 'S/B',
            repackedSmallBags: 40,
            repackedBigBags: 40, // 80 !== 100
          } as never,
          100,
          '1001',
        ),
      ).toThrow("Repacked counts (40 small + 40 big = 80) must match total stock of 100 bags for GRN '1001'");
    });

    it('requires chamber text to be valid', () => {
      expect(() =>
        validateTransferRepack(
          {
            grnId: 'grn-1',
            newCustomerId: 'cust-2',
            remarks: 'Transfer test',
            destinationChamber: '',
          } as never,
          100,
          '1001',
        ),
      ).toThrow('Chamber is required');
    });

    it('accepts valid repacking parameters', () => {
      expect(() =>
        validateTransferRepack(
          {
            grnId: 'grn-1',
            newCustomerId: 'cust-2',
            remarks: 'Transfer test',
            destinationChamber: 'CH-02',
            resultingBagType: 'S/B',
            repackedSmallBags: 60,
            repackedBigBags: 40,
            referenceWeight: 5000,
          } as never,
          100,
          '1001',
        ),
      ).not.toThrow();
    });
  });
});
