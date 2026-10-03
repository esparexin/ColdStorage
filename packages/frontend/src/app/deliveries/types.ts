/** A delivery withdraws a single bag count from the GRN's ledger-derived available balance. */
export interface GrnWithdrawal {
  maxBags: number;
  bags: number | '';
}
