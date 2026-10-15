import mongoose from 'mongoose';
import { randomUUID } from 'node:crypto';
import { isHybridBagCategory, resolveMergedBagType, resolveStoredCompositionVerified, type Grn, type InternalMovementRecord, type MergeGrnInput } from '@cold-storage/contracts';
import { GrnModel } from '../../../database/models/grn.model.js';
import { rentRepository } from '../../rent/rent.repository.js';
import { resolveMovementObligation } from './resolve-movement-obligation.js';
import { computeRentBalance } from '../../common/rent-balance.js';
import { readLedgerBalance } from '../../inventory/ledger-balance.js';
import { auditService } from '../../audit/audit.service.js';
import { toGrnEntity } from '../../grn/grn.mappers.js';
import { resolveSourceRentObligation, closeSourceGrnOnMerge } from './merge-grn.helper.js';
import { validatePartialMovesInput, processMergeSource } from './merge-source-move.helper.js';
import { validateMergeRepackedCounts } from './merge-grn-validation.helper.js';
import { withMongoRetry } from '../../common/mongo-retry.helper.js';
import { createMergePutawayTransaction, createMergeMovementRecord } from './merge-grn-movement.helper.js';
import { resolveMergeRepackHamali } from './merge-repack-hamali.helper.js';

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
  let repackHamaliCharge = 0;

  try {
    await withMongoRetry(() =>
      session.withTransaction(async () => {
      const targetGrn = await GrnModel.findOne({ id: input.targetGrnId, facilityId }, null, { session }).lean().exec();
      if (!targetGrn) throw new Error(`Target GRN '${input.targetGrnId}' not found in facility '${facilityId}'`);
      if (targetGrn.status === 'CLOSED') throw new Error(`Cannot merge into CLOSED GRN '${targetGrn.grnNumber}'`);
      if (targetGrn.loanStatus === 'TAKEN') throw new Error(`Target GRN '${targetGrn.grnNumber}' has an active loan hold`);
      const targetBal = await readLedgerBalance(facilityId, targetGrn.id, session);
      if (targetBal.total <= 0) throw new Error(`Cannot merge into Target GRN '${targetGrn.grnNumber}' with zero remaining stock`);

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
      validatePartialMovesInput(input);
      for (const s of sourceGrns) {
        const step = await processMergeSource({
          facilityId, sourceGrn: s, targetGrn, input, movementId, moveDate, userId, session,
        });
        totalSourcePendingRent += step.pendingRent;
        totalMovedBags += step.movedTotal;
        totalMovedSmall += step.movedSmall;
        totalMovedBig += step.movedBig;
        sourceSummaries.push(step.summary);
      }

      const { smallMoved, bigMoved, explicitConfirmation } = validateMergeRepackedCounts({
        targetGrn, sourceGrns,
        repackedSmallBags: input.repackedSmallBags, repackedBigBags: input.repackedBigBags,
        sourceBagCategory: input.sourceBagCategory ?? null, sourceQuantity: input.sourceQuantity ?? null,
        sourceBagPrice: input.sourceBagPrice ?? null, sourceSeasonalBagPrice: input.sourceSeasonalBagPrice ?? null,
        sourceMonthlyBagPrice: input.sourceMonthlyBagPrice ?? null,
        totalMovedBags, defaultSmallMoved: totalMovedSmall, defaultBigMoved: totalMovedBig,
        movementDate: moveDate,
      });
      totalMovedSmall = smallMoved;
      totalMovedBig = bigMoved;
      const targetWasVerified = resolveStoredCompositionVerified({
        isCompositionVerified: (targetGrn as unknown as Record<string, unknown>).isCompositionVerified as boolean | null ?? null,
        bagType: targetGrn.bagType, bags: targetGrn.bags, smallBags: targetGrn.smallBags, bigBags: targetGrn.bigBags,
      });
      const allSourcesVerified = (sourceGrns as unknown as Record<string, unknown>[]).every((s) =>
        resolveStoredCompositionVerified({
          isCompositionVerified: s.isCompositionVerified as boolean | null ?? null,
          bagType: s.bagType as never, bags: s.bags as number,
          smallBags: s.smallBags as number | null, bigBags: s.bigBags as number | null,
        }),
      );
      const newIsCompositionVerified = explicitConfirmation ? true : targetWasVerified && allSourcesVerified;

      // When additionalRentAmount > 0 is supplied, it overrides the carried rent obligation;
      // otherwise (when omitted or 0), the cumulative source pending rent is automatically carried forward.
      finalCarriedRent =
        input.additionalRentAmount != null && input.additionalRentAmount > 0
          ? input.additionalRentAmount
          : totalSourcePendingRent;

      const repackHamali = await resolveMergeRepackHamali({
        commodityId: targetGrn.commodityId,
        repackedSmallBags: input.repackedSmallBags,
        repackedBigBags: input.repackedBigBags,
        totalMovedBags,
        session,
      });
      repackHamaliCharge = repackHamali.repackHamaliCharge;

      const newBags = targetGrn.bags + totalMovedBags;
      const newSmall = targetGrn.smallBags + totalMovedSmall;
      const newBig = targetGrn.bigBags + totalMovedBig;
      const newRentAmount = Number((targetGrn.rentAmount + finalCarriedRent + repackHamali.repackHamaliCharge).toFixed(2));
      const resultingBagType = resolveMergedBagType({
        targetBagType: targetGrn.bagType,
        sourceBagTypes: sourceGrns.map((s) => s.bagType),
        newSmallBags: newSmall,
        newBigBags: newBig,
      });

      await createMergePutawayTransaction({
        facilityId,
        movementId,
        moveDate,
        targetGrn,
        resultingBagType,
        sourceGrns,
        totalMovedSmall,
        totalMovedBig,
        remarks: input.remarks,
        userId,
        session,
      });

      const moveDateStr = moveDate.toISOString().split('T')[0];
      const repackedNote = input.repackedSmallBags != null ? ` (Repacked: ${totalMovedSmall} S + ${totalMovedBig} B)` : '';
      const repackHamaliNote = repackHamali.repackHamaliCharge > 0 ? `. Repacking Hamali: ₹${repackHamali.repackHamaliCharge} (${repackHamali.repackHamaliBags} bags @ ₹${repackHamali.repackHamaliRate}/bag)` : '';
      const categoryNote =
        input.sourceBagCategory != null && isHybridBagCategory(input.sourceBagCategory)
          ? ` (Confirmed Hybrid: ${totalMovedBags} bags)`
          : '';
      const carriedRentNote = finalCarriedRent > 0 ? `. Carried pending rent: ₹${finalCarriedRent}` : '';
      const targetNote = `[MERGE RECEIVED on ${moveDateStr}: +${totalMovedBags} bags${repackedNote}${repackHamaliNote}${categoryNote} from ${sourceSummaries.join('; ')}${carriedRentNote}. Reason: ${input.remarks.trim()}]`;
      const updatedTargetRemarks = targetGrn.remarks ? `${targetGrn.remarks}\n${targetNote}` : targetNote;

      const updatedTarget = await GrnModel.findOneAndUpdate(
        { id: targetGrn.id },
        {
          $set: {
            bagType: resultingBagType,
            bags: newBags,
            smallBags: newSmall,
            bigBags: newBig,
            isCompositionVerified: newIsCompositionVerified,
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

      const targetPaid = (await rentRepository.findPaymentsByGrnId(facilityId, targetGrn.id, session))
        .reduce((sum, p) => sum + p.amountPaid, 0);
      const target = { id: targetGrn.id, rentAmount: newRentAmount, rentType: targetGrn.rentType };
      const targetTotalDue = await resolveMovementObligation(facilityId, target, session);
      const targetRentBal = computeRentBalance(targetTotalDue, targetPaid);

      resultMovementDoc = await createMergeMovementRecord({
        facilityId, movementId, moveDate, targetGrn, sourceGrns,
        totalMovedBags, totalMovedSmall, totalMovedBig, newRentAmount,
        targetPaid, targetRentBal,
        hamaliBags: repackHamali.repackHamaliBags,
        hamaliRate: repackHamali.repackHamaliRate,
        hamaliCharge: repackHamali.repackHamaliCharge,
        input, userId, session,
      });
    }),
    );
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
      repackHamaliCharge,
      newRentAmount: movementRecord.financialSnapshot.rentAmount,
      sourceBagCategory: movementRecord.sourceBagCategory ?? null,
      referenceWeight: input.referenceWeight ?? null,
      remarks: input.remarks,
    },
  });

  return { targetGrn: targetEntity, movement: movementRecord };
}
