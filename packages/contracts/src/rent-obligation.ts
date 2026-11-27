import { z } from 'zod';
import { totalRentDue } from './rent-extension.js';

/**
 * THE rent-obligation SSOT (W2).
 *
 * Before this module there were SIX independent derivations of "what is owed
 * on this GRN". Two of them were complete; four omitted either the outward
 * rent charges or the first-season Hamali, so the same GRN reported
 * different balances depending on which screen or service asked:
 *
 *   rent-summary.helper.ts    complete   (the reference implementation)
 *   record-payment.handler.ts complete
 *   rent-gate.service.ts      rentAmount only - no outward, no Hamali
 *   storage-audit-report.ts   rentAmount only - no outward, no Hamali
 *   merge-grn.helper.ts       effectiveRentAmount only
 *   transfer-ownership.handler  a FIFTH base rule entirely
 *
 * Production evidence that this was not theoretical: GRN 0015 has an outward
 * rent charge of 422,250 and a stored rentAmount of 0. Under the complete rule
 * it is simply paid in full; under the four partial rules it reports a 0
 * obligation against 422,250 collected - a 4.22 lakh phantom overpayment.
 *
 * Callers that cannot supply a piece of the input pass 0 or [] for it, which
 * degrades to the correct answer for GRNs where that component is genuinely
 * absent. What must never happen is deriving the obligation any other way.
 */
export interface RentObligationInput {
  /**
   * Drives the base selection. A Monthly GRN is billed on the greater of its
   * stored obligation and what it has already been charged on outward
   * deliveries, because a Monthly charge accrues per delivery. A Seasonal
   * GRN is billed once for the term, so its stored amount wins outright.
   */
  rentType: 'Monthly' | 'Seasonal' | 'Seasonal_3M';
  /** Stored rent obligation on the GRN. `null`/absent means "not yet billed". */
  rentAmount: number | null | undefined;
  /** Sum of rent charges on the GRN's ISSUED delivery challans. */
  outwardRentCharges?: number | null;
  /** Per-period extension finalAmounts (seasonal renewal, Jan/Feb periods). */
  extensionAmounts?: Array<number | null | undefined> | null;
  /** First-season Hamali share owed on this GRN. */
  hamaliShare?: number | null;
  /** Remaining undelivered bags on the GRN (for pro-rata uncollected inward Hamali). */
  remainingBags?: number | null;
  /** Total initial intake bags on the GRN. */
  totalBags?: number | null;
}

/**
 * Derives the applicable Hamali component for the resolved obligation.
 *
 * Hamali applies in full when the base is the stored rent amount (which carries
 * no labor charges) or before any outward delivery has occurred. For zero-rent
 * intakes where outward charges are already accumulated, Hamali applies pro-rata
 * strictly to the uncollected remaining undelivered bags, preventing double-counting.
 */
function deriveHamaliComponent(
  baseRent: number,
  rentAmount: number,
  outwardRentCharges: number,
  hamaliShare: number,
  remainingBags: number | null,
  totalBags: number,
): number {
  if (!Number.isFinite(hamaliShare) || hamaliShare <= 0) return 0;
  if (baseRent === rentAmount && rentAmount > 0) return hamaliShare;
  if (outwardRentCharges === 0) return hamaliShare;
  if (remainingBags != null && totalBags > 0 && remainingBags > 0) {
    const ratio = Math.min(1, Math.max(0, remainingBags / totalBags));
    return Number((hamaliShare * ratio).toFixed(2));
  }
  return 0;
}

/**
 * Resolves the total rent obligation for a GRN.
 *
 * Base selection:
 *   Monthly, Seasonal, Seasonal_3M -> max(rentAmount, outwardRentCharges)
 *
 * Seasonal outward deliveries across multiple seasons or extended durations expand
 * the base to cover the issued outward delivery challans, preventing payment rejection.
 *
 * Hamali joins the total exactly once without double-counting.
 * Extensions are additive and always apply. All arithmetic is rounded to two
 * decimals at the end, so the result is stable regardless of caller order.
 */
export function resolveTotalRentObligation(input: RentObligationInput): number {
  const rentAmount = Number(input.rentAmount ?? 0);
  const outwardRentCharges = Number(input.outwardRentCharges ?? 0);
  const extensionAmounts = (input.extensionAmounts ?? []).map((v) => Number(v ?? 0));
  const hamaliShare = Number(input.hamaliShare ?? 0);
  const totalBags = Number(input.totalBags ?? 0);
  const remainingBags = input.remainingBags != null ? Number(input.remainingBags) : null;

  const baseRent = Math.max(rentAmount, outwardRentCharges);
  const hamali = deriveHamaliComponent(
    baseRent,
    rentAmount,
    outwardRentCharges,
    hamaliShare,
    remainingBags,
    totalBags,
  );

  return Number((totalRentDue(baseRent, extensionAmounts) + hamali).toFixed(2));
}

/**
 * Splits the resolved obligation into the components callers persist.
 *
 * `baseRent` is what a caller should write back to a GRN's `rentAmount`; the
 * Hamali component must never be folded into it, because
 * {@link resolveTotalRentObligation} decides whether Hamali applies from
 * whether `rentAmount` is positive.
 */
export function splitRentObligation(input: RentObligationInput): {
  baseRent: number;
  hamali: number;
  total: number;
} {
  const rentAmount = Number(input.rentAmount ?? 0);
  const outwardRentCharges = Number(input.outwardRentCharges ?? 0);
  const hamaliShare = Number(input.hamaliShare ?? 0);
  const totalBags = Number(input.totalBags ?? 0);
  const remainingBags = input.remainingBags != null ? Number(input.remainingBags) : null;

  const baseRent =
    input.rentType === 'Monthly' || input.rentType === 'Seasonal_3M'
      ? Math.max(rentAmount, outwardRentCharges)
      : rentAmount > 0
        ? rentAmount
        : outwardRentCharges;
  const hamali = deriveHamaliComponent(
    baseRent,
    rentAmount,
    outwardRentCharges,
    hamaliShare,
    remainingBags,
    totalBags,
  );

  return {
    baseRent: Number(baseRent.toFixed(2)),
    hamali: Number(hamali.toFixed(2)),
    total: resolveTotalRentObligation(input),
  };
}

export const rentObligationInputSchema = z.object({
  rentType: z.enum(['Monthly', 'Seasonal', 'Seasonal_3M']),
  rentAmount: z.number().nullish(),
  outwardRentCharges: z.number().nullish(),
  extensionAmounts: z.array(z.number().nullish()).nullish(),
  hamaliShare: z.number().nullish(),
  remainingBags: z.number().nullish(),
  totalBags: z.number().nullish(),
});
