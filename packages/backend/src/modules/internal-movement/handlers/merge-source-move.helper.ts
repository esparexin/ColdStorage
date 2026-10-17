import mongoose from 'mongoose';
import type { MergeGrnInput } from '@cold-storage/contracts';
import { readLedgerBalance } from '../../inventory/ledger-balance.js';
import { resolveSourceRentObligation, closeSourceGrnOnMerge, type MergeSourceGrn } from './merge-grn.helper.js';
import { validateMergeRepackedCounts } from './merge-grn-validation.helper.js';

/**
 * Pre-drain validation (D9): confirms the move composition from prospective
 * ledger balances BEFORE any source is drained, so a repack mismatch aborts
 * without partial side effects. Returns the confirmed credit for the target.
 * Enforces full merge only: 100% of each source GRN's stock is accounted for.
 */
export async function validateProspectiveMergeMove(params: {
  facilityId: string; targetGrn: MergeSourceGrn & { date: Date }; sourceGrns: MergeSourceGrn[];
  input: MergeGrnInput; moveDate: Date; session: mongoose.ClientSession;
}): Promise<{ totalMovedBags: number; smallMoved: number; bigMoved: number; explicitConfirmation: boolean }> {
  const { facilityId, targetGrn, sourceGrns, input, moveDate, session } = params;
  let prospectiveBags = 0;
  let prospectiveSmall = 0;
  let prospectiveBig = 0;
  for (const s of sourceGrns) {
    assertSourceMergeable(s, targetGrn);
    const bal = await readLedgerBalance(facilityId, s.id, session);
    if (bal.total <= 0) throw new Error(`Source GRN '${s.grnNumber}' has zero remaining bags to merge`);
    prospectiveBags += bal.total;
    prospectiveSmall += bal.smallBags;
    prospectiveBig += bal.bigBags;
  }
  const confirmed = validateMergeRepackedCounts({
    targetGrn: {
      bagType: targetGrn.bagType, bags: targetGrn.bags, smallBags: targetGrn.smallBags,
      bigBags: targetGrn.bigBags, smallBagPrice: targetGrn.smallBagPrice, bigBagPrice: targetGrn.bigBagPrice,
      date: targetGrn.date, grnNumber: targetGrn.grnNumber,
      isCompositionVerified: targetGrn.isCompositionVerified ?? null,
    },
    sourceGrns,
    repackedSmallBags: input.repackedSmallBags, repackedBigBags: input.repackedBigBags,
    sourceBagCategory: input.sourceBagCategory ?? null, sourceQuantity: input.sourceQuantity ?? null,
    sourceBagPrice: input.sourceBagPrice ?? null, sourceSeasonalBagPrice: input.sourceSeasonalBagPrice ?? null,
    sourceMonthlyBagPrice: input.sourceMonthlyBagPrice ?? null,
    totalMovedBags: prospectiveBags, defaultSmallMoved: prospectiveSmall, defaultBigMoved: prospectiveBig,
    movementDate: moveDate,
  });
  return { totalMovedBags: prospectiveBags, ...confirmed };
}

/** Structural guards in stable precedence order (CLOSED before zero-balance). */
export function assertSourceMergeable(sourceGrn: MergeSourceGrn, targetGrn: MergeSourceGrn): void {
  const s = sourceGrn;
  if (s.status === 'CLOSED') throw new Error(`Source GRN '${s.grnNumber}' is already CLOSED`);
  if (s.commodityId !== targetGrn.commodityId) throw new Error(`Commodity mismatch: Source GRN '${s.grnNumber}' does not match Target GRN '${targetGrn.grnNumber}'`);
  if (s.loanStatus === 'TAKEN') throw new Error(`Source GRN '${s.grnNumber}' has an active loan hold`);
  if (s.rentType !== targetGrn.rentType) {
    throw new Error(`Rent type mismatch: Source GRN '${s.grnNumber}' (${s.rentType}) cannot merge into Target '${targetGrn.grnNumber}' (${targetGrn.rentType}). Same rent type required.`);
  }
}

/** Per-source move step (full merge only). Moves all remaining stock and closes the source GRN. */
export async function processMergeSource(params: {
  facilityId: string; sourceGrn: MergeSourceGrn; targetGrn: MergeSourceGrn & { date: Date };
  input: MergeGrnInput; movementId: string; moveDate: Date; userId: string;
  session: mongoose.ClientSession;
}): Promise<{ movedTotal: number; movedSmall: number; movedBig: number; summary: string; pendingRent: number }> {
  const { facilityId, sourceGrn: s, targetGrn, input, movementId, moveDate, userId, session } = params;
  assertSourceMergeable(s, targetGrn);
  const bal = await readLedgerBalance(facilityId, s.id, session);
  if (bal.total <= 0) throw new Error(`Source GRN '${s.grnNumber}' has zero remaining bags to merge`);
  const rentResolution = await resolveSourceRentObligation({
    facilityId, sourceGrn: s, targetGrnDate: targetGrn.date, movementDate: moveDate,
    sourcePaymentAmount: input.sourcePaymentAmount, sourcePaymentMode: input.sourcePaymentMode, userId, session,
    sourceBagCategory: input.sourceBagCategory, sourceQuantity: bal.total, sourceBagPrice: input.sourceBagPrice,
    sourceSeasonalBagPrice: input.sourceSeasonalBagPrice, sourceMonthlyBagPrice: input.sourceMonthlyBagPrice,
  });
  const summary = await closeSourceGrnOnMerge({
    facilityId, sourceGrn: s, targetGrnNumber: targetGrn.grnNumber, targetGrnId: targetGrn.id,
    movementId, movementDate: moveDate, ledgerBalance: bal, rentResolution, remarks: input.remarks, userId, session,
  });
  return { movedTotal: bal.total, movedSmall: bal.smallBags, movedBig: bal.bigBags, summary, pendingRent: rentResolution.rentBal.remainingBalance };
}
