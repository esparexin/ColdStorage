import mongoose from 'mongoose';
import { randomUUID } from 'node:crypto';
import { calculateHamaliAmount, isHybridBagCategory, resolveEffectiveGrnRentType, type MergeGrnInput } from '@cold-storage/contracts';
import { CommodityModel } from '../../../database/models/commodity.model.js';
import { rentRepository } from '../../rent/rent.repository.js';
import { counterService } from '../../common/counter.service.js';
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
}): Promise<{
  totalMovedBags: number;
  smallMoved: number;
  bigMoved: number;
  actualMovedBags: number;
  repackVariance: number;
  repackSourceBags: number;
  explicitConfirmation: boolean;
}> {
  const { facilityId, targetGrn, sourceGrns, input, moveDate, session } = params;
  let prospectiveBags = 0;
  let prospectiveSmall = 0;
  let prospectiveBig = 0;
  for (const s of sourceGrns) {
    assertSourceMergeable(s, targetGrn, moveDate);
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
    repackedBagCount: input.repackedBagCount,
    sourceBagType: input.sourceBagType ?? null,
    sourceBagCategory: input.sourceBagCategory ?? null, sourceQuantity: input.sourceQuantity ?? null,
    sourceBagPrice: input.sourceBagPrice ?? null, sourceSeasonalBagPrice: input.sourceSeasonalBagPrice ?? null,
    sourceMonthlyBagPrice: input.sourceMonthlyBagPrice ?? null,
    totalMovedBags: prospectiveBags, defaultSmallMoved: prospectiveSmall, defaultBigMoved: prospectiveBig,
    movementDate: moveDate, isRepackSelected: input.isRepackSelected,
  });
  return { totalMovedBags: prospectiveBags, ...confirmed };
}

/** Structural guards in stable precedence order (CLOSED before zero-balance). */
export function assertSourceMergeable(sourceGrn: MergeSourceGrn, targetGrn: MergeSourceGrn, moveDate?: Date): void {
  const s = sourceGrn;
  if (s.status === 'CLOSED') throw new Error(`Source GRN '${s.grnNumber}' is already CLOSED`);
  if (s.commodityId !== targetGrn.commodityId) throw new Error(`Commodity mismatch: Source GRN '${s.grnNumber}' does not match Target GRN '${targetGrn.grnNumber}'`);
  if (s.loanStatus === 'TAKEN') throw new Error(`Source GRN '${s.grnNumber}' has an active loan hold`);
  const effectiveSourceRentType = resolveEffectiveGrnRentType({
    rentType: s.rentType, inwardDate: s.date, asOfDate: moveDate ?? new Date(),
  });
  const effectiveTargetRentType = resolveEffectiveGrnRentType({
    rentType: targetGrn.rentType, inwardDate: targetGrn.date, asOfDate: moveDate ?? new Date(),
  });
  if (effectiveSourceRentType !== effectiveTargetRentType) {
    throw new Error(`Rent type mismatch: Source GRN '${s.grnNumber}' (${effectiveSourceRentType}) cannot merge into Target '${targetGrn.grnNumber}' (${effectiveTargetRentType}). Same rent type required.`);
  }
}

/** Per-source move step (full merge only). Moves all remaining stock and closes the source GRN. */
export async function processMergeSource(params: {
  facilityId: string; sourceGrn: MergeSourceGrn; targetGrn: MergeSourceGrn & { date: Date };
  input: MergeGrnInput; movementId: string; moveDate: Date; userId: string;
  session: mongoose.ClientSession; allocatedPayment?: number;
}): Promise<{ movedTotal: number; movedSmall: number; movedBig: number; summary: string; pendingRent: number; paidAmount: number }> {
  const { facilityId, sourceGrn: s, targetGrn, input, movementId, moveDate, userId, session, allocatedPayment } = params;
  assertSourceMergeable(s, targetGrn, moveDate);
  const bal = await readLedgerBalance(facilityId, s.id, session);
  if (bal.total <= 0) throw new Error(`Source GRN '${s.grnNumber}' has zero remaining bags to merge`);
  const effectivePayment = allocatedPayment !== undefined ? allocatedPayment : input.sourcePaymentAmount;
  const isSourceHybrid = s.bagType === 'Hybrid' || isHybridBagCategory(s.bagType);
  const effectiveCategory = input.sourceGrnIds.length === 1 ? (input.sourceBagCategory ?? (isSourceHybrid ? 'Hybrid' : undefined)) : (isSourceHybrid ? 'Hybrid' : undefined);
  const rentResolution = await resolveSourceRentObligation({
    facilityId, sourceGrn: s, targetGrnDate: targetGrn.date, movementDate: moveDate,
    targetGrnNumber: targetGrn.grnNumber,
    sourcePaymentAmount: effectivePayment, sourcePaymentMode: input.sourcePaymentMode, userId, session,
    sourceBagCategory: effectiveCategory, sourceQuantity: bal.total,
    sourceBagPrice: input.sourceGrnIds.length === 1 ? input.sourceBagPrice : s.bagPrice,
    sourceSeasonalBagPrice: input.sourceGrnIds.length === 1 ? input.sourceSeasonalBagPrice : (s.smallBagPrice ?? s.bagPrice),
    sourceMonthlyBagPrice: input.sourceGrnIds.length === 1 ? input.sourceMonthlyBagPrice : (s.bigBagPrice ?? s.bagPrice),
    confirmedSmallBags: bal.smallBags, confirmedBigBags: bal.bigBags,
    isSingleSource: input.sourceGrnIds.length === 1,
  });
  const summary = await closeSourceGrnOnMerge({
    facilityId, sourceGrn: s, targetGrnNumber: targetGrn.grnNumber, targetGrnId: targetGrn.id,
    movementId, movementDate: moveDate, ledgerBalance: bal, rentResolution, remarks: input.remarks, userId, session,
  });
  return { movedTotal: bal.total, movedSmall: bal.smallBags, movedBig: bal.bigBags, summary, pendingRent: rentResolution.rentBal.remainingBalance, paidAmount: rentResolution.paidAmount };
}

/** Settles pending Target GRN inward handling Hamali from merge payment pool. */
export async function settleTargetHamaliPayment(params: {
  facilityId: string;
  targetGrn: MergeSourceGrn & { id: string; grnNumber: string; bags: number; commodityId: string; customerId?: string; customerName: string };
  moveDate: Date;
  allocatedPayment: number;
  paymentMode?: string | null;
  userId: string;
  session: mongoose.ClientSession;
}): Promise<{ paidAmount: number }> {
  const { facilityId, targetGrn, moveDate, allocatedPayment, paymentMode, userId, session } = params;
  if (allocatedPayment <= 0.01) return { paidAmount: 0 };

  const targetPaid = (await rentRepository.findPaymentsByGrnId(facilityId, targetGrn.id, session))
    .reduce((sum, p) => sum + p.amountPaid, 0);
  const commodity = await CommodityModel.findOne({ id: targetGrn.commodityId }, null, { session }).lean().exec();
  const rate = (commodity?.isHamaliApplicable ?? (commodity?.hamaliRate ?? 0) > 0) ? (commodity?.hamaliRate ?? 0) : 0;
  const targetHamaliAmount = calculateHamaliAmount(targetGrn.bags, rate);
  const targetDue = Math.max(0, targetHamaliAmount - targetPaid);
  const payAmount = Math.min(allocatedPayment, targetDue);

  if (payAmount > 0) {
    const receiptNumber = await counterService.generateRentReceiptNumber(facilityId, moveDate, session);
    await rentRepository.createPayment({
      id: `rent-pay-${randomUUID()}`, facilityId, grnId: targetGrn.id, grnNumber: targetGrn.grnNumber,
      customerId: targetGrn.customerId, customerName: targetGrn.customerName,
      receiptNumber, amountPaid: payAmount, paymentMode: (paymentMode ?? 'Cash') as 'Cash' | 'UPI',
      paymentDate: moveDate, notes: `Merge settlement: Target GRN ${targetGrn.grnNumber} Hamali handling`, createdBy: userId,
    }, session);
    return { paidAmount: payAmount };
  }
  return { paidAmount: 0 };
}
