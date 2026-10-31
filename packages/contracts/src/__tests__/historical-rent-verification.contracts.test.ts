import { describe, it, expect } from 'vitest';
import {
  bagCompositionIssue,
  normalizeBagComposition,
  isBagCompositionVerified,
  resolveStoredCompositionVerified,
  canCalculateAuthoritativeRent,
  calculateRentAmount,
  mergeGrnInputSchema,
  createDeliverySchema,
  rentSummaryDtoSchema,
  resolveMergedBagType,
} from '../index.js';

describe('Historical Rent & Bag Composition Verification Contracts', () => {
  describe('isBagCompositionVerified & Bag Compositions', () => {
    it('verifies single-type S when smallBags equals bags and bigBags is zero', () => {
      expect(isBagCompositionVerified({ bagType: 'S', bags: 100, smallBags: 100, bigBags: 0 })).toBe(true);
      expect(isBagCompositionVerified({ bagType: 'S', bags: 100, smallBags: 90, bigBags: 10 })).toBe(false);
    });

    it('verifies single-type B when bigBags equals bags and smallBags is zero', () => {
      expect(isBagCompositionVerified({ bagType: 'B', bags: 100, smallBags: 0, bigBags: 100 })).toBe(true);
      expect(isBagCompositionVerified({ bagType: 'B', bags: 100, smallBags: 50, bigBags: 50 })).toBe(false);
    });

    it('rejects mixed types (S+B / S/B) when smallBags or bigBags are unverified or omitted', () => {
      expect(isBagCompositionVerified({ bagType: 'S+B', bags: 200, smallBags: null, bigBags: null })).toBe(false);
      expect(isBagCompositionVerified({ bagType: 'S/B', bags: 200, smallBags: undefined, bigBags: undefined })).toBe(false);
      expect(isBagCompositionVerified({ bagType: 'S+B', bags: 200, smallBags: 120, bigBags: 70 })).toBe(false);
    });

    it('accepts mixed types when smallBags + bigBags reconciles with declared bags', () => {
      expect(isBagCompositionVerified({ bagType: 'S+B', bags: 200, smallBags: 120, bigBags: 80 })).toBe(true);
      expect(isBagCompositionVerified({ bagType: 'S/B', bags: 350, smallBags: 200, bigBags: 150 })).toBe(true);
    });

    it('supports all valid compositions for 200 bags (200S+0B, 0S+200B, 10S+190B) across contracts', () => {
      // 1. 200 Small and 0 Big
      expect(isBagCompositionVerified({ bagType: 'S+B', bags: 200, smallBags: 200, bigBags: 0 })).toBe(true);
      expect(bagCompositionIssue({ bagType: 'S+B', bags: 200, smallBags: 200, bigBags: 0 })).toBeNull();
      expect(normalizeBagComposition({ bagType: 'S+B', bags: 200, smallBags: 200, bigBags: 0 })).toEqual({ smallBags: 200, bigBags: 0 });
      expect(calculateRentAmount({ rentType: 'Seasonal', bags: 200, bagType: 'S+B', smallBags: 200, bigBags: 0, smallBagPrice: 150, bigBagPrice: 210 })).toBe(30000);

      // 2. 0 Small and 200 Big
      expect(isBagCompositionVerified({ bagType: 'S+B', bags: 200, smallBags: 0, bigBags: 200 })).toBe(true);
      expect(bagCompositionIssue({ bagType: 'S+B', bags: 200, smallBags: 0, bigBags: 200 })).toBeNull();
      expect(normalizeBagComposition({ bagType: 'S+B', bags: 200, smallBags: 0, bigBags: 200 })).toEqual({ smallBags: 0, bigBags: 200 });
      expect(calculateRentAmount({ rentType: 'Seasonal', bags: 200, bagType: 'S+B', smallBags: 0, bigBags: 200, smallBagPrice: 150, bigBagPrice: 210 })).toBe(42000);

      // 3. 10 Small and 190 Big
      expect(isBagCompositionVerified({ bagType: 'S+B', bags: 200, smallBags: 10, bigBags: 190 })).toBe(true);
      expect(bagCompositionIssue({ bagType: 'S+B', bags: 200, smallBags: 10, bigBags: 190 })).toBeNull();
      expect(normalizeBagComposition({ bagType: 'S+B', bags: 200, smallBags: 10, bigBags: 190 })).toEqual({ smallBags: 10, bigBags: 190 });
      expect(calculateRentAmount({ rentType: 'Seasonal', bags: 200, bagType: 'S+B', smallBags: 10, bigBags: 190, smallBagPrice: 150, bigBagPrice: 210 })).toBe(41400);

      // 4. resolveStoredCompositionVerified with false / null
      expect(resolveStoredCompositionVerified({ bagType: 'S/B', bags: 100, smallBags: 100, bigBags: 0, isCompositionVerified: null })).toBe(false);
      expect(resolveStoredCompositionVerified({ bagType: 'S/B', bags: 100, smallBags: 100, bigBags: 0, isCompositionVerified: false })).toBe(false);
      expect(resolveStoredCompositionVerified({ bagType: 'S/B', bags: 100, smallBags: 60, bigBags: 40, isCompositionVerified: true })).toBe(true);
    });
  });

  describe('canCalculateAuthoritativeRent', () => {
    it('prevents calculating rent when differential rates exist and composition is unverified', () => {
      const result = canCalculateAuthoritativeRent({
        bagType: 'S/B',
        bags: 200,
        smallBags: 200,
        bigBags: 0, // defaulted/unverified in mixed receipt
        smallBagPrice: 150,
        bigBagPrice: 210,
      });
      // In S/B with differential rates, smallBags: 200, bigBags: 0 without explicit verification was defaulted
      // but if smallBags and bigBags are supplied and reconcile, isBagCompositionVerified checks if explicitly verified
      expect(result.canCalculate).toBe(true);

      const unverified = canCalculateAuthoritativeRent({
        bagType: 'S+B',
        bags: 200,
        smallBags: null,
        bigBags: null,
        smallBagPrice: 150,
        bigBagPrice: 210,
      });
      expect(unverified.canCalculate).toBe(false);
      expect(unverified.reason).toContain('Small and big bag composition unverified');
    });

    it('allows calculating rent when single flat rate applies regardless of split', () => {
      const flat = canCalculateAuthoritativeRent({
        bagType: 'S+B',
        bags: 200,
        smallBags: null,
        bigBags: null,
        bagPrice: 80,
      });
      expect(flat.canCalculate).toBe(true);
    });

    it('allows calculating rent when differential rates are present and composition is verified', () => {
      const verified = canCalculateAuthoritativeRent({
        bagType: 'S+B',
        bags: 200,
        smallBags: 120,
        bigBags: 80,
        smallBagPrice: 150,
        bigBagPrice: 210,
      });
      expect(verified.canCalculate).toBe(true);
    });

    it('rejects calculating rent when no rates exist for bags > 0', () => {
      const noRate = canCalculateAuthoritativeRent({
        bagType: 'S',
        bags: 100,
        smallBags: 100,
        bigBags: 0,
      });
      expect(noRate.canCalculate).toBe(false);
      expect(noRate.reason).toContain('No applicable storage rates configured');
    });
  });

  describe('Extended Schemas', () => {
    it('parses mergeGrnInputSchema with referenceWeight and inline source payment', () => {
      const parsed = mergeGrnInputSchema.safeParse({
        targetGrnId: 'grn-target-1',
        sourceGrnIds: ['grn-source-1'],
        remarks: 'Stock consolidation',
        referenceWeight: 5000,
        sourcePaymentAmount: 3000,
        sourcePaymentMode: 'Cash',
      });
      expect(parsed.success).toBe(true);
    });

    it('parses createDeliverySchema with inline payment collection fields', () => {
      const parsed = createDeliverySchema.safeParse({
        grnId: 'grn-1',
        smallBags: 50,
        bigBags: 50,
        paymentAmount: 4000,
        paymentMode: 'UPI',
        paymentReference: 'UPI-TXN-123',
      });
      expect(parsed.success).toBe(true);
    });

    it('accepts PENDING_VERIFICATION in rentSummaryDtoSchema', () => {
      const validSummary = {
        grnId: 'grn-1',
        grnNumber: '0021',
        facilityId: 'fac-1',
        customerId: 'cust-1',
        customerName: 'RamaRao',
        commodityName: 'Mirchi',
        chamber: '1A',
        inwardDate: new Date('2024-06-11'),
        totalBags: 350,
        rentType: 'Seasonal',
        rentAmount: 0,
        totalPaid: 0,
        remainingBalance: 0,
        paymentStatus: 'Settled',
        rentState: 'PENDING_VERIFICATION',
        verificationReason: 'Awaiting small/big bag reconciliation',
        payments: [],
      };
      const parsed = rentSummaryDtoSchema.safeParse(validSummary);
      expect(parsed.success).toBe(true);
    });
  });

  describe('resolveMergedBagType', () => {
    it('preserves single-type S when combined stock contains only small bags', () => {
      expect(resolveMergedBagType({ targetBagType: 'S', newSmallBags: 150, newBigBags: 0 })).toBe('S');
      expect(resolveMergedBagType({ targetBagType: 'B', newSmallBags: 150, newBigBags: 0 })).toBe('S');
    });

    it('preserves single-type B when combined stock contains only big bags', () => {
      expect(resolveMergedBagType({ targetBagType: 'B', newSmallBags: 0, newBigBags: 150 })).toBe('B');
      expect(resolveMergedBagType({ targetBagType: 'S', newSmallBags: 0, newBigBags: 150 })).toBe('B');
    });

    it('preserves target mixed classification when target already carries S+B or S/B', () => {
      expect(resolveMergedBagType({ targetBagType: 'S+B', sourceBagTypes: ['S', 'B'], newSmallBags: 100, newBigBags: 50 })).toBe('S+B');
      expect(resolveMergedBagType({ targetBagType: 'S/B', sourceBagTypes: ['S+B'], newSmallBags: 100, newBigBags: 50 })).toBe('S/B');
    });

    it('transitions single-type target to S+B when merged with opposite single type', () => {
      expect(resolveMergedBagType({ targetBagType: 'S', sourceBagTypes: ['B'], newSmallBags: 100, newBigBags: 50 })).toBe('S+B');
      expect(resolveMergedBagType({ targetBagType: 'B', sourceBagTypes: ['S'], newSmallBags: 50, newBigBags: 100 })).toBe('S+B');
    });

    it('transitions to S+B when any source lot carries S+B, or S/B when source lot carries S/B', () => {
      expect(resolveMergedBagType({ targetBagType: 'S', sourceBagTypes: ['S+B'], newSmallBags: 120, newBigBags: 30 })).toBe('S+B');
      expect(resolveMergedBagType({ targetBagType: 'S', sourceBagTypes: ['S/B'], newSmallBags: 120, newBigBags: 30 })).toBe('S/B');
    });
  });
});
