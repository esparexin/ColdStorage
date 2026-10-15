import mongoose from 'mongoose';
import type { MergeGrnInput } from '@cold-storage/contracts';
import { readLedgerBalance } from '../../inventory/ledger-balance.js';
import { resolveSourceRentObligation, closeSourceGrnOnMerge, type MergeSourceGrn } from './merge-grn.helper.js';
import { resolvePartialMoveQty, applyPartialMergeDeduction } from './merge-partial.helper.js';

/** Per-source move step (M2 full + partial). Returns moved qty, summary and pending rent to carry. */
export async function processMergeSource(params: {
  facilityId: string; sourceGrn: MergeSourceGrn; targetGrn: MergeSourceGrn & { date: Date };
  input: MergeGrnInput; movementId: string; moveDate: Date; userId: string;
  session: mongoose.ClientSession;
}): Promise<{ movedTotal: number; movedSmall: number; movedBig: number; summary: string; pendingRent: number }> {
  const { facilityId, sourceGrn: s, targetGrn, input, movementId, moveDate, userId, session } = params;
  if (s.status === 'CLOSED') throw new Error(`Source GRN '${s.grnNumber}' is already CLOSED`);
  if (s.commodityId !== targetGrn.commodityId) throw new Error(`Commodity mismatch: Source GRN '${s.grnNumber}' does not match Target GRN '${targetGrn.grnNumber}'`);
  if (s.loanStatus === 'TAKEN') throw new Error(`Source GRN '${s.grnNumber}' has an active loan hold`);
  const bal = await readLedgerBalance(facilityId, s.id, session);
  if (bal.total <= 0) throw new Error(`Source GRN '${s.grnNumber}' has zero remaining bags to merge`);
  const partial = input.partialMoves?.find((m) => m.sourceGrnId === s.id);
  const rentResolution = await resolveSourceRentObligation({
    facilityId, sourceGrn: s, targetGrnDate: targetGrn.date, movementDate: moveDate,
    sourcePaymentAmount: input.sourcePaymentAmount, sourcePaymentMode: input.sourcePaymentMode, userId, session,
  });
  if (partial) {
    const qty = resolvePartialMoveQty(bal, partial.smallBags, partial.bigBags);
    if (qty.total === bal.total) {
      const summary = await closeSourceGrnOnMerge({
        facilityId, sourceGrn: s, targetGrnNumber: targetGrn.grnNumber, targetGrnId: targetGrn.id,
        movementId, movementDate: moveDate, ledgerBalance: bal, rentResolution, remarks: input.remarks, userId, session,
      });
      return { movedTotal: qty.total, movedSmall: qty.small, movedBig: qty.big, summary, pendingRent: rentResolution.rentBal.remainingBalance };
    }
    await applyPartialMergeDeduction({
      facilityId, sourceId: s.id, sourceNumber: s.grnNumber, chamber: s.chamber, commodityId: s.commodityId,
      bagType: s.bagType, moveSmall: qty.small, moveBig: qty.big, moveTotal: qty.total,
      targetNumber: targetGrn.grnNumber, movementId, movementDate: moveDate, remarks: input.remarks, userId, session,
    });
    return {
      movedTotal: qty.total, movedSmall: qty.small, movedBig: qty.big,
      summary: `GRN ${s.grnNumber} (Partial: ${qty.total} bags moved, ${bal.total - qty.total} retained OPEN)`, pendingRent: 0,
    };
  }
  const summary = await closeSourceGrnOnMerge({
    facilityId, sourceGrn: s, targetGrnNumber: targetGrn.grnNumber, targetGrnId: targetGrn.id,
    movementId, movementDate: moveDate, ledgerBalance: bal, rentResolution, remarks: input.remarks, userId, session,
  });
  return { movedTotal: bal.total, movedSmall: bal.smallBags, movedBig: bal.bigBags, summary, pendingRent: rentResolution.rentBal.remainingBalance };
}

/** Pre-loop partial-move reference validation (M2). */
export function validatePartialMovesInput(input: MergeGrnInput): void {
  if (!input.partialMoves?.length) return;
  const ids = input.partialMoves.map((m) => m.sourceGrnId);
  if (new Set(ids).size !== ids.length) throw new Error('Duplicate source GRN in partial moves');
  for (const m of input.partialMoves) {
    if (!input.sourceGrnIds.includes(m.sourceGrnId)) throw new Error(`Partial move references unknown source '${m.sourceGrnId}'`);
  }
}
