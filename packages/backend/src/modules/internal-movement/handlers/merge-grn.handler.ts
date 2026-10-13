import mongoose from 'mongoose';
import { randomUUID } from 'node:crypto';
import { isHybridBagCategory, resolveMergedBagType, type Grn, type InternalMovementRecord, type MergeGrnInput } from '@cold-storage/contracts';
import { GrnModel } from '../../../database/models/grn.model.js';
import { InventoryTransactionModel } from '../../../database/models/inventory-transaction.model.js';
import { rentRepository } from '../../rent/rent.repository.js';
import { InternalMovementModel } from '../../../database/models/internal-movement.model.js';
import { computeRentBalance } from '../../common/rent-balance.js';
import { rentExtensionRepository } from '../../rent/rent-extension.repository.js';
import { readLedgerBalance } from '../../inventory/ledger-balance.js';
import { auditService } from '../../audit/audit.service.js';
import { toGrnEntity } from '../../grn/grn.mappers.js';
import { resolveSourceRentObligation, closeSourceGrnOnMerge } from './merge-grn.helper.js';
import { validateMergeRepackedCounts } from './merge-grn-validation.helper.js';

export async function mergeGrn(
  facilityId: string,
  input: MergeGrnInput,
  userId: string,
): Promise<{ targetGrn: Grn; movement: InternalMovementRecord }> {
  if (input.sourceGrnIds.includes(input.targetGrnId)) {
    throw new Error('Target GRN cannot be included in source GRNs list');
  }
  if (new Set(input.sourceGrnIds).size !== input.sourceGrnIds.length) {
    throw new Error('Duplicate source GRN IDs are not allowed');
  }
  if (input.sourceGrnIds.length > 1 && (input.sourcePaymentAmount ?? 0) > 0) {
    throw new Error('Settlement payment requires a single source GRN');
  }

  const session = await mongoose.startSession();
  let resultTargetDoc!: unknown;
  let resultMovementDoc!: unknown;
  let finalCarriedRent = 0;

  try {
    await session.withTransaction(async () => {
      const targetGrn = await GrnModel.findOne({ id: input.targetGrnId, facilityId }, null, { session }).lean().exec();
      if (!targetGrn) throw new Error(`Target GRN '${input.targetGrnId}' not found in facility '${facilityId}'`);
      if (targetGrn.status === 'CLOSED') throw new Error(`Cannot merge into CLOSED GRN '${targetGrn.grnNumber}'`);
      if (targetGrn.loanStatus === 'TAKEN') throw new Error(`Target GRN '${targetGrn.grnNumber}' has an active loan hold`);

      const sourceGrns = await GrnModel.find({ id: { $in: input.sourceGrnIds }, facilityId }, null, { session }).lean().exec();
      if (sourceGrns.length !== input.sourceGrnIds.length) {
        throw new Error('One or more source GRNs were not found in this facility');
      }

      const movementId = `mov-${randomUUID()}`;
      let totalMovedBags = 0;
      let totalMovedSmall = 0;
      let totalMovedBig = 0;
      let totalSourcePendingRent = 0;
      const sourceSummaries: string[] = [];
      const moveDate = new Date(input.movementDate);

      for (const s of sourceGrns) {
        if (s.status === 'CLOSED') throw new Error(`Source GRN '${s.grnNumber}' is already CLOSED`);
        if (s.commodityId !== targetGrn.commodityId) {
          throw new Error(`Commodity mismatch: Source GRN '${s.grnNumber}' (${s.commodityName}) does not match Target GRN '${targetGrn.grnNumber}' (${targetGrn.commodityName})`);
        }
        if (s.loanStatus === 'TAKEN') throw new Error(`Source GRN '${s.grnNumber}' has an active loan hold`);

        const bal = await readLedgerBalance(facilityId, s.id, session);
        if (bal.total <= 0) throw new Error(`Source GRN '${s.grnNumber}' has zero remaining bags to merge`);

        const rentResolution = await resolveSourceRentObligation({
          facilityId,
          sourceGrn: s,
          targetGrnDate: targetGrn.date,
          movementDate: moveDate,
          sourcePaymentAmount: input.sourcePaymentAmount,
          sourcePaymentMode: input.sourcePaymentMode,
          userId,
          session,
        });
        totalSourcePendingRent += rentResolution.rentBal.remainingBalance;

        totalMovedBags += bal.total;
        totalMovedSmall += bal.smallBags;
        totalMovedBig += bal.bigBags;

        const summaryStr = await closeSourceGrnOnMerge({
          facilityId, sourceGrn: s, targetGrnNumber: targetGrn.grnNumber, targetGrnId: targetGrn.id,
          movementId, movementDate: moveDate, ledgerBalance: bal, rentResolution,
          remarks: input.remarks, userId, session,
        });
        sourceSummaries.push(summaryStr);
      }

      const { smallMoved, bigMoved } = validateMergeRepackedCounts({
        targetGrn,
        sourceGrns,
        repackedSmallBags: input.repackedSmallBags,
        repackedBigBags: input.repackedBigBags,
        sourceBagCategory: input.sourceBagCategory ?? null,
        sourceQuantity: input.sourceQuantity ?? null,
        sourceBagPrice: input.sourceBagPrice ?? null,
        sourceSeasonalBagPrice: input.sourceSeasonalBagPrice ?? null,
        sourceMonthlyBagPrice: input.sourceMonthlyBagPrice ?? null,
        totalMovedBags,
        defaultSmallMoved: totalMovedSmall,
        defaultBigMoved: totalMovedBig,
        movementDate: moveDate,
      });
      totalMovedSmall = smallMoved;
      totalMovedBig = bigMoved;

      // When additionalRentAmount > 0 is supplied, it overrides the carried rent obligation;
      // otherwise (when omitted or 0), the cumulative source pending rent is automatically carried forward.
      finalCarriedRent =
        input.additionalRentAmount != null && input.additionalRentAmount > 0
          ? input.additionalRentAmount
          : totalSourcePendingRent;

      const newBags = targetGrn.bags + totalMovedBags;
      const newSmall = targetGrn.smallBags + totalMovedSmall;
      const newBig = targetGrn.bigBags + totalMovedBig;
      const newRentAmount = targetGrn.rentAmount + finalCarriedRent;
      const resultingBagType = resolveMergedBagType({
        targetBagType: targetGrn.bagType,
        sourceBagTypes: sourceGrns.map((s) => s.bagType),
        newSmallBags: newSmall,
        newBigBags: newBig,
      });

      await InventoryTransactionModel.create(
        [
          {
            id: `tx-${randomUUID()}`,
            facilityId,
            grnId: targetGrn.id,
            grnNumber: targetGrn.grnNumber,
            chamber: targetGrn.chamber,
            commodityId: targetGrn.commodityId,
            bagType: resultingBagType,
            transactionType: 'INWARD_PUTAWAY',
            smallQuantity: totalMovedSmall,
            bigQuantity: totalMovedBig,
            referenceType: 'PUT_AWAY',
            referenceId: movementId,
            notes: `Merged from GRNs ${sourceGrns.map((s) => s.grnNumber).join(', ')}: ${input.remarks.trim()}`,
            createdBy: userId,
            createdAt: moveDate,
          },
        ],
        { session, ordered: true },
      );

      const moveDateStr = moveDate.toISOString().split('T')[0];
      const repackedNote = input.repackedSmallBags != null ? ` (Repacked: ${totalMovedSmall} S + ${totalMovedBig} B)` : '';
      const categoryNote =
        input.sourceBagCategory != null && isHybridBagCategory(input.sourceBagCategory)
          ? ` (Confirmed Hybrid: ${totalMovedBags} bags)`
          : input.sourceBagCategory === 'Small' || input.sourceBagCategory === 'Big'
            ? ` (Confirmed ${input.sourceBagCategory}: ${totalMovedSmall} S + ${totalMovedBig} B)`
            : '';
      const carriedRentNote = finalCarriedRent > 0 ? `. Carried pending rent: ₹${finalCarriedRent}` : '';
      const targetNote = `[MERGE RECEIVED on ${moveDateStr}: +${totalMovedBags} bags${repackedNote}${categoryNote} from ${sourceSummaries.join('; ')}${carriedRentNote}. Reason: ${input.remarks.trim()}]`;
      const updatedTargetRemarks = targetGrn.remarks ? `${targetGrn.remarks}\n${targetNote}` : targetNote;

      const updatedTarget = await GrnModel.findOneAndUpdate(
        { id: targetGrn.id },
        {
          $set: {
            bagType: resultingBagType,
            bags: newBags,
            smallBags: newSmall,
            bigBags: newBig,
            rentAmount: newRentAmount,
            remarks: updatedTargetRemarks,
            updatedAt: new Date(),
          },
        },
        { session, new: true },
      )
        .lean()
        .exec();

      resultTargetDoc = updatedTarget;

      const targetPayments = await rentRepository.findPaymentsByGrnId(facilityId, targetGrn.id, session);
      const targetPaid = targetPayments.reduce((sum, p) => sum + p.amountPaid, 0);
      const targetTotalDue = await rentExtensionRepository.resolveTotalDue(facilityId, { id: targetGrn.id, rentAmount: newRentAmount }, session);
      const targetRentBal = computeRentBalance(targetTotalDue, targetPaid);

      const movementDocs = await InternalMovementModel.create(
        [
          {
            id: movementId,
            facilityId,
            movementType: 'MERGE',
            movementDate: moveDate,
            targetGrnId: targetGrn.id,
            targetGrnNumber: targetGrn.grnNumber,
            sourceGrnIds: sourceGrns.map((s) => s.id),
            sourceGrnNumbers: sourceGrns.map((s) => s.grnNumber),
            totalBagsMoved: totalMovedBags,
            smallBagsMoved: totalMovedSmall,
            bigBagsMoved: totalMovedBig,
            sourceBagCategory: input.sourceBagCategory ?? null,
            sourceQuantity: input.sourceQuantity ?? null,
            sourceBagPrice: input.sourceBagPrice ?? null,
            sourceSeasonalBagPrice: input.sourceSeasonalBagPrice ?? null,
            sourceMonthlyBagPrice: input.sourceMonthlyBagPrice ?? null,
            referenceWeight: input.referenceWeight ?? null,
            financialSnapshot: {
              rentAmount: newRentAmount,
              totalPaid: targetPaid,
              remainingBalance: targetRentBal.remainingBalance,
              paymentStatus: targetRentBal.paymentStatus,
              rentState: targetRentBal.rentState,
            },
            remarks: input.remarks.trim(),
            performedBy: userId,
            createdAt: new Date(),
          },
        ],
        { session, ordered: true },
      );

      resultMovementDoc = movementDocs[0].toObject();
    });
  } finally {
    await session.endSession();
  }

  const movementRecord = resultMovementDoc as InternalMovementRecord;
  const targetEntity = toGrnEntity(resultTargetDoc as import('../../../database/models/grn.model.js').GrnDoc);

  await auditService.log({
    eventType: 'INTERNAL_MOVEMENT_MERGE',
    severity: 'INFO',
    userId,
    facilityId,
    resource: 'grn',
    resourceId: targetEntity.id,
    details: {
      targetGrnNumber: targetEntity.grnNumber,
      sourceGrnNumbers: movementRecord.sourceGrnNumbers,
      totalBagsMoved: movementRecord.totalBagsMoved,
      carriedRent: finalCarriedRent,
      newRentAmount: movementRecord.financialSnapshot.rentAmount,
      sourceBagCategory: movementRecord.sourceBagCategory ?? null,
      referenceWeight: input.referenceWeight ?? null,
      remarks: input.remarks,
    },
  });

  return { targetGrn: targetEntity, movement: movementRecord };
}
