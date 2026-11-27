import { describe, expect, it } from 'vitest';
import {
  formatTransferComposition,
  formatTransferHamali,
  formatTransferSettlement,
} from '../transferStep3Summary.helper';
import { buildTransferExecutionArgs } from '../transferPayload.helper';

describe('transferStep3Summary.helper', () => {
  describe('formatTransferComposition', () => {
    it('formats Hybrid composition with remaining bags', () => {
      expect(
        formatTransferComposition({
          isHybrid: true,
          remainingBags: 17,
          confirmedSmallBags: '',
          confirmedBigBags: '',
        }),
      ).toBe('17 Hybrid');
    });

    it('formats S/B composition with confirmed small and big bags', () => {
      expect(
        formatTransferComposition({
          isHybrid: false,
          remainingBags: 100,
          confirmedSmallBags: 60,
          confirmedBigBags: 40,
        }),
      ).toBe('60 Small + 40 Big');
    });

    it('handles empty string counts in S/B fallback cleanly', () => {
      expect(
        formatTransferComposition({
          isHybrid: false,
          remainingBags: 50,
          confirmedSmallBags: '',
          confirmedBigBags: 50,
        }),
      ).toBe('0 Small + 50 Big');
    });
  });

  describe('formatTransferHamali', () => {
    it('formats hamali rate and amount when applicable', () => {
      expect(
        formatTransferHamali({
          hamaliRate: 5,
          hamaliAmount: 85,
        }),
      ).toBe('₹5/bag (₹85)');
    });

    it('returns "None" when hamali rate is zero or null', () => {
      expect(formatTransferHamali({ hamaliRate: 0, hamaliAmount: 0 })).toBe('None');
      expect(formatTransferHamali({ hamaliRate: null, hamaliAmount: 0 })).toBe('None');
      expect(formatTransferHamali({ hamaliRate: undefined, hamaliAmount: 0 })).toBe('None');
    });
  });

  describe('formatTransferSettlement', () => {
    it('returns fully settled when effective dues are zero or negative', () => {
      expect(
        formatTransferSettlement({
          effectiveDue: 0,
          decision: 'AGREED_PENDING',
          settleAmount: 0,
        }),
      ).toBe('Fully Settled (₹0 due)');
    });

    it('formats Pay Now with settled amount', () => {
      expect(
        formatTransferSettlement({
          effectiveDue: 6460,
          decision: 'SETTLE_NOW',
          settleAmount: 6460,
          newCustomerName: 'Kalyan',
        }),
      ).toBe('Pay Now (₹6,460 settled)');
    });

    it('formats Pay Later carry forward with new owner name', () => {
      expect(
        formatTransferSettlement({
          effectiveDue: 6460,
          decision: 'AGREED_PENDING',
          settleAmount: 0,
          newCustomerName: 'Kalyan',
        }),
      ).toBe('Pay Later (Liability carried to Kalyan)');
    });

    it('formats Pay Later carry forward without new customer name cleanly', () => {
      expect(
        formatTransferSettlement({
          effectiveDue: 6460,
          decision: 'AGREED_PENDING',
          settleAmount: 0,
        }),
      ).toBe('Pay Later (Liability carried forward)');
    });
  });

  describe('buildTransferExecutionArgs', () => {
    it('builds S/B repack execution arguments with labor charges properly formatted', () => {
      const args = buildTransferExecutionArgs({
        isHybrid: false,
        remainingBags: 100,
        confirmedSmallBags: 60,
        confirmedBigBags: 40,
        destinationChamber: 'CH-02',
        resultingBagType: 'S/B',
        repackedSmallBags: 70,
        repackedBigBags: 30,
        referenceWeight: 5000,
        partyMark: 'KSN-99',
        transferFeePerBag: 5,
        transferFeeCharged: 500,
        paymentMode: 'Cash',
        feePaidBy: 'BUYER',
      });

      expect(args.conf).toEqual({ confirmedSmallBags: 60, confirmedBigBags: 40 });
      expect(args.repack).toEqual({
        destinationChamber: 'CH-02',
        resultingBagType: 'S/B',
        repackedSmallBags: 70,
        repackedBigBags: 30,
        repackedQuantity: undefined,
        referenceWeight: 5000,
        partyMark: 'KSN-99',
      });
      expect(args.fee).toEqual({
        transferFeePerBag: 5,
        totalTransferFee: 500,
        feePaymentMode: 'Cash',
        feePaidBy: 'BUYER',
      });
    });

    it('builds Hybrid repack execution arguments omitting S/B counts', () => {
      const args = buildTransferExecutionArgs({
        isHybrid: true,
        sourceBagCategory: 'Hybrid',
        remainingBags: 50,
        destinationChamber: 'CH-01',
        resultingBagType: 'Hybrid',
        repackedQuantity: 50,
        partyMark: '',
        transferFeePerBag: '',
        transferFeeCharged: 0,
        paymentMode: 'Cash',
      });

      expect(args.conf?.sourceQuantity).toBe(50);
      expect(args.repack.repackedQuantity).toBe(50);
      expect(args.repack.repackedSmallBags).toBeUndefined();
      expect(args.fee).toBeUndefined();
    });
  });
});

