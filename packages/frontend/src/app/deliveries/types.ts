/**
 * A delivery withdraws a bag composition from the GRN's available balance. The available figures
 * are the per-type ceilings the operator may not exceed; the entered figures are what will move.
 */
export interface GrnWithdrawal {
  availableSmall: number;
  availableBig: number;
  smallBags: number | '';
  bigBags: number | '';
}