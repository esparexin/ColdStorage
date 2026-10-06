/**
 * A delivery withdraws bags from the GRN's available balance. The available figures
 * are the per-type ceilings the operator may not exceed; the entered figures are what will move.
 *
 * The payload stays a composition ({smallBags, bigBags}) because the delivery API and its
 * per-type ledger guard require it. The UI, however, takes a single bag quantity from the
 * operator and maps it onto the GRN's available side (see setWithdrawalQuantity): every GRN
 * created by the current Inward Form (Total Bags + Bag Type only) normalizes server-side to a
 * single-sided composition, so one side is always zero. A true two-sided balance can only
 * arise through the administrative GRN correction workflow.
 */
export interface GrnWithdrawal {
  availableSmall: number;
  availableBig: number;
  smallBags: number | '';
  bigBags: number | '';
}