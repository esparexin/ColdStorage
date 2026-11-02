import { describe, expect, it } from 'vitest';

describe('mergeSettlementStatus - Source GRN Step 2 & Step 3 Settlement Truthfulness', () => {
  // Helper replicating the canonical derivation in MergeSourceGrnCard:
  // Actual payment evidence from ledger summary is strictly authoritative.
  // Stored rentPaymentStatus: 'Settled' is NEVER trusted as proof of payment when obligations exist.
  const deriveSettlement = (params: {
    totalDue?: number;
    totalAmountToPay: number;
    totalPaid?: number;
    sourcePaymentStatus?: string;
    sourceRemainingBalance?: number;
    sourceRentAmount?: number;
  }) => {
    const paid = params.totalPaid ?? 0;
    const totalObligation = Math.max(params.totalDue ?? 0, params.totalAmountToPay);
    const pendingDues = Math.max(0, totalObligation - paid);
    const isSettled = totalObligation === 0 || (paid >= totalObligation && totalObligation > 0);
    return { isSettled, pendingDues, totalObligation };
  };

  it('does NOT mark unbilled GRN as settled when unbilled obligation exists', () => {
    // Unbilled GRN with historical obligations (e.g. ₹3,240 dues, 0 paid)
    // Even if initial computeRentBalance had paymentStatus: 'Settled', it must NOT be marked Settled
    const unbilled = deriveSettlement({
      totalDue: 0,
      totalAmountToPay: 3240,
      totalPaid: 0,
      sourcePaymentStatus: 'Settled',
      sourceRemainingBalance: 0,
    });
    expect(unbilled.isSettled).toBe(false);
    expect(unbilled.pendingDues).toBe(3240);
  });

  it('marks partially paid GRN as pending with remaining balance', () => {
    // Partially paid GRN (₹3,240 obligation, ₹3,040 paid) -> ₹200 pending
    const partial = deriveSettlement({
      totalDue: 3240,
      totalAmountToPay: 3240,
      totalPaid: 3040,
    });
    expect(partial.isSettled).toBe(false);
    expect(partial.pendingDues).toBe(200);
  });

  it('marks genuinely fully paid GRN as settled (₹0 Due)', () => {
    // Fully paid GRN (₹3,240 obligation, ₹3,240 paid) -> Settled (₹0 Due)
    const settled = deriveSettlement({
      totalDue: 3240,
      totalAmountToPay: 3240,
      totalPaid: 3240,
    });
    expect(settled.isSettled).toBe(true);
    expect(settled.pendingDues).toBe(0);
  });

  it('marks zero-obligation GRN as settled (₹0 Due)', () => {
    // Zero obligation GRN -> Settled (₹0 Due)
    const zeroDue = deriveSettlement({
      totalDue: 0,
      totalAmountToPay: 0,
      totalPaid: 0,
    });
    expect(zeroDue.isSettled).toBe(true);
    expect(zeroDue.pendingDues).toBe(0);
  });
});

