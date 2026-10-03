import type { PaymentStatus } from '@cold-storage/contracts';

/**
 * Canonical rent balance derivation (P0-Rule 2).
 *
 * The GRN is the sole source of truth for the rent obligation; payments reference it. Every
 * reader of rent state — the rent summary, the payment collector and the outward-movement gate
 * — must derive the balance through this function so a single formula governs the system.
 *
 * Invariants enforced here:
 *  - a negative balance is impossible (clamped to 0, never surfaced as a credit)
 *  - balances are rounded to 2 decimal places exactly once, here
 *  - payment status is derived, never stored
 */
export interface RentBalance {
  rentAmount: number;
  totalPaid: number;
  remainingBalance: number;
  paymentStatus: PaymentStatus;
  /** True when some but not all of the obligation has been collected. */
  isPartial: boolean;
}

export function computeRentBalance(rentAmount: number, totalPaid: number): RentBalance {
  const obligation = Number(rentAmount ?? 0);
  const paid = Number(totalPaid ?? 0);
  const remainingBalance = Math.max(0, Number((obligation - paid).toFixed(2)));

  return {
    rentAmount: obligation,
    totalPaid: paid,
    remainingBalance,
    paymentStatus: remainingBalance === 0 ? 'Settled' : 'Not Settled',
    isPartial: paid > 0 && remainingBalance > 0,
  };
}