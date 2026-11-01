import type { PaymentStatus, RentState } from '@cold-storage/contracts';

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
 *  - rent state distinguishes SETTLED (obligation > 0 & fully paid), PENDING (remaining dues),
 *    and UNBILLED (zero obligation & zero paid, e.g. unassessed or dynamic lots).
 */
export interface RentBalance {
  rentAmount: number;
  totalPaid: number;
  remainingBalance: number;
  paymentStatus: PaymentStatus;
  /** True when some but not all of the obligation has been collected. */
  isPartial: boolean;
  rentState: RentState;
}

export interface ComputeRentBalanceOptions {
  isPendingVerification?: boolean;
}

export function computeRentBalance(
  rentAmount: number,
  totalPaid: number,
  options?: ComputeRentBalanceOptions,
): RentBalance {
  const obligation = Number(rentAmount ?? 0);
  const paid = Number(totalPaid ?? 0);
  const remainingBalance = Math.max(0, Number((obligation - paid).toFixed(2)));

  const isSettled = obligation > 0 && remainingBalance === 0;
  const isUnbilled = obligation === 0 && paid === 0;

  let rentState: RentState;
  if (options?.isPendingVerification) {
    rentState = 'PENDING_VERIFICATION';
  } else if (isSettled) {
    rentState = 'SETTLED';
  } else if (isUnbilled) {
    rentState = 'UNBILLED';
  } else {
    rentState = 'PENDING';
  }

  return {
    rentAmount: obligation,
    totalPaid: paid,
    remainingBalance,
    paymentStatus: remainingBalance === 0 ? 'Settled' : 'Not Settled',
    isPartial: paid > 0 && remainingBalance > 0,
    rentState,
  };
}