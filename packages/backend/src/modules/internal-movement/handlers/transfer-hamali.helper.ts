/**
 * Ownership-transfer hamali accounting (Phase 4 — hamali-accounting-integrity).
 * Carry-only: the GRN keeps its stored rate and amount; the movement record
 * carries the existing obligation forward. No new charge is created, so retries
 * and repeat transfers can never duplicate hamali.
 */
export function resolveTransferHamali(grn: {
  hamaliRate?: number | null;
  hamaliAmount?: number | null;
}): { hamaliRate: number; hamaliBags: number; hamaliCharge: number; hamaliCarried: number; snapshotHamali: number } {
  const hamaliRate = typeof grn.hamaliRate === 'number' ? grn.hamaliRate : 0;
  const carried = typeof grn.hamaliAmount === 'number' ? grn.hamaliAmount : 0;
  const hamaliCarried = Number(Math.max(0, carried).toFixed(2));
  return { hamaliRate, hamaliBags: 0, hamaliCharge: 0, hamaliCarried, snapshotHamali: hamaliCarried };
}
