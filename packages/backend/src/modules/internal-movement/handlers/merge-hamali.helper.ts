import { calculateHamaliAmount } from '@cold-storage/contracts';

/**
 * Merge hamali accounting (Phase 3 — hamali-accounting-integrity).
 * Additive reconcile: destination keeps its rate and existing amount;
 * sources carry outstanding hamali (remaining bags x source historical rate);
 * an explicit repack selection creates one new charge (target rate x hamaliBags).
 * No recalculation of history, no double charge.
 */
export function validateHamaliBags(hamaliBags: number | null | undefined, totalMovedBags: number): number {
  if (hamaliBags === null || hamaliBags === undefined) return 0;
  if (!Number.isInteger(hamaliBags) || hamaliBags < 0) {
    throw new Error('Hamali bag count must be a non-negative whole number');
  }
  if (hamaliBags > totalMovedBags) {
    throw new Error(`Hamali bag count (${hamaliBags}) cannot exceed total moved stock of ${totalMovedBags} bags`);
  }
  return hamaliBags;
}

export function computeMergeHamali(input: {
  targetHamaliRate?: number | null;
  targetHamaliAmount?: number | null;
  sources: Array<{ hamaliRate?: number | null; remainingBags: number }>;
  hamaliBags: number;
}): { hamaliRate: number; hamaliBags: number; hamaliCharge: number; hamaliCarried: number; newHamaliAmount: number } {
  const hamaliRate = typeof input.targetHamaliRate === 'number' ? input.targetHamaliRate : 0;
  let hamaliCarried = 0;
  for (const s of input.sources) {
    hamaliCarried += calculateHamaliAmount(s.remainingBags, typeof s.hamaliRate === 'number' ? s.hamaliRate : 0);
  }
  hamaliCarried = Number(hamaliCarried.toFixed(2));
  const hamaliCharge = calculateHamaliAmount(input.hamaliBags, hamaliRate);
  const newHamaliAmount = Number(((input.targetHamaliAmount ?? 0) + hamaliCarried + hamaliCharge).toFixed(2));
  return { hamaliRate, hamaliBags: input.hamaliBags, hamaliCharge, hamaliCarried, newHamaliAmount };
}

export function buildMergeTargetNote(input: {
  moveDate: Date; totalMovedBags: number; totalMovedSmall: number; totalMovedBig: number;
  repackedSmallBags?: number | null; mergeHamali: { hamaliCharge: number; hamaliCarried: number; hamaliBags: number; hamaliRate: number };
  sourceSummaries: string[]; finalCarriedRent: number; remarks: string; existingRemarks?: string | null;
}): string {
  const moveDateStr = input.moveDate.toISOString().split('T')[0];
  const hamaliParen = input.mergeHamali.hamaliCharge > 0 || input.mergeHamali.hamaliCarried > 0
    ? `; Hamali carried ₹${input.mergeHamali.hamaliCarried}, repack ₹${input.mergeHamali.hamaliCharge} on ${input.mergeHamali.hamaliBags} bags @ ₹${input.mergeHamali.hamaliRate}`
    : '';
  const repackedNote = input.repackedSmallBags != null
    ? ` (Repacked: ${input.totalMovedSmall} S + ${input.totalMovedBig} B${hamaliParen})`
    : hamaliParen ? ` (Hamali:${hamaliParen.replace(/^; /, ' ')})` : '';
  const carriedRentNote = input.finalCarriedRent > 0 ? `. Carried pending rent: ₹${input.finalCarriedRent}` : '';
  const note = `[MERGE RECEIVED on ${moveDateStr}: +${input.totalMovedBags} bags${repackedNote} from ${input.sourceSummaries.join('; ')}${carriedRentNote}. Reason: ${input.remarks.trim()}]`;
  return input.existingRemarks ? `${input.existingRemarks}\n${note}` : note;
}

export function buildMergeMovementDoc(input: {
  movementId: string; facilityId: string; moveDate: Date;
  targetGrn: { id: string; grnNumber: string };
  sourceGrns: Array<{ id: string; grnNumber: string }>;
  totalMovedBags: number; totalMovedSmall: number; totalMovedBig: number;
  mergeHamali: { hamaliBags: number; hamaliRate: number; hamaliCharge: number; hamaliCarried: number; newHamaliAmount: number };
  referenceWeight?: number | null; newRentAmount: number; targetPaid: number;
  rentBal: { remainingBalance: number; paymentStatus: string; rentState?: string | null };
  remarks: string; userId: string;
}): Record<string, unknown> {
  return {
    id: input.movementId, facilityId: input.facilityId, movementType: 'MERGE', movementDate: input.moveDate,
    targetGrnId: input.targetGrn.id, targetGrnNumber: input.targetGrn.grnNumber,
    sourceGrnIds: input.sourceGrns.map((s) => s.id), sourceGrnNumbers: input.sourceGrns.map((s) => s.grnNumber),
    totalBagsMoved: input.totalMovedBags, smallBagsMoved: input.totalMovedSmall, bigBagsMoved: input.totalMovedBig,
    hamaliBags: input.mergeHamali.hamaliBags, hamaliRate: input.mergeHamali.hamaliRate,
    hamaliCharge: input.mergeHamali.hamaliCharge, hamaliCarried: input.mergeHamali.hamaliCarried,
    referenceWeight: input.referenceWeight ?? null,
    financialSnapshot: {
      rentAmount: input.newRentAmount, totalPaid: input.targetPaid,
      remainingBalance: input.rentBal.remainingBalance, paymentStatus: input.rentBal.paymentStatus,
      rentState: input.rentBal.rentState, hamaliAmount: input.mergeHamali.newHamaliAmount,
    },
    remarks: input.remarks.trim(), performedBy: input.userId, createdAt: new Date(),
  };
}
