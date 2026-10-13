import { calculateHamaliAmount } from '@cold-storage/contracts';

/**
 * Outward hamali settlement (Phase 2 — hamali-accounting-integrity).
 * Settles outstanding hamali for delivered bags only, using the GRN's stored
 * historical rate so config changes cannot reprice history. GRN.hamaliAmount
 * stays frozen; the challan carries per-delivery accounting.
 */
export function resolveOutwardHamali(input: {
  withdrawnTotal: number;
  grnHamaliRate?: number | null;
  inputHamaliCharge?: number | null;
}): { hamaliRate: number; hamaliCharge: number } {
  const hamaliRate = typeof input.grnHamaliRate === 'number' ? input.grnHamaliRate : 0;
  const hamaliCharge = calculateHamaliAmount(input.withdrawnTotal, hamaliRate);
  if (input.inputHamaliCharge != null && input.inputHamaliCharge >= 0) {
    if (Math.abs(input.inputHamaliCharge - hamaliCharge) > 0.01) {
      throw new Error(
        `hamaliCharge mismatch: expected ₹${hamaliCharge.toLocaleString('en-IN')}, received ₹${input.inputHamaliCharge.toLocaleString('en-IN')}`,
      );
    }
  }
  return { hamaliRate, hamaliCharge };
}
