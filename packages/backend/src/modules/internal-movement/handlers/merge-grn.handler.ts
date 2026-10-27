import mongoose from 'mongoose';
import { randomUUID } from 'node:crypto';
import { appendGrnRemarks, isHybridBagCategory, resolveMergedBagType, resolveStoredCompositionVerified, type Grn, type InternalMovementRecord, type MergeGrnInput } from '@cold-storage/contracts';
import { GrnModel } from '../../../database/models/grn.model.js';
import { InternalMovementModel } from '../../../database/models/internal-movement.model.js';
import { rentRepository } from '../../rent/rent.repository.js';
import { resolveMovementObligation } from './resolve-movement-obligation.js';
import { computeRentBalance } from '../../common/rent-balance.js';
import { readLedgerBalance } from '../../inventory/ledger-balance.js';
import { auditService } from '../../audit/audit.service.js';
import { toGrnEntity } from '../../grn/grn.mappers.js';
import { validateProspectiveMergeMove, processMergeSource } from './merge-source-move.helper.js';
import { withMongoRetry } from '../../common/mongo-retry.helper.js';
import { createMergePutawayTransaction, createMergeMovementRecord } from './merge-grn-movement.helper.js';
import { resolveMergeRepackHamali } from './merge-repack-hamali.helper.js';
import { validateOperationalDate } from '../../common/operational-date.helper.js';

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

  const session = await mongoose.startSession();
  let resultTargetDoc!: unknown;
  let resultMovementDoc!: unknown;
  let finalCarriedRent = 0;
  let repackHamaliCharge = 0;
  let idempotentHit = false;

  try {
    await withMongoRetry(() =>
      session.withTransaction(async () => {
      // Idempotency: if a movement with this key already exists, return the cached result.
      if (input.idempotencyKey) {
        const existing = await InternalMovementModel.findOne({
          facilityId, idempotencyKey: input.idempotencyKey,
        }, null, { session }).lean().exec();
        if (existing) {
          const existingTarget = await GrnModel.findOne({ id: existing.targetGrnId, facilityId }, null, { session }).lean().exec();
          if (existingTarget) {
            resultTargetDoc = existingTarget;
            resultMovementDoc = existing as unknown as InternalMovementRecord;
            idempotentHit = true;
            return; // exit transaction early
          }
        }
      }

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
      const moveDate = validateOperationalDate(input.movementDate, { label: 'Movement' });
      const confirmed = await validateProspectiveMergeMove({
        facilityId, targetGrn, sourceGrns, input, moveDate, session,
      });
      let remainingPaymentPool = input.sourcePaymentAmount ?? 0;
      for (const s of sourceGrns) {
        const step = await processMergeSource({
          facilityId, sourceGrn: s, targetGrn, input, movementId, moveDate, userId, session,
          allocatedPayment: remainingPaymentPool,
        });
        remainingPaymentPool = Math.max(0, Number((remainingPaymentPool - step.paidAmount).toFixed(2)));
        totalSourcePendingRent += step.pendingRent;
        totalMovedBags += step.movedTotal;
        totalMovedSmall += step.movedSmall;
        totalMovedBig += step.movedBig;
        sourceSummaries.push(step.summary);
      }
      if (remainingPaymentPool > 0.01) {
        throw new Error(
          `Requested payment ₹${input.sourcePaymentAmount} exceeds total remaining rent balance across source GRNs`,
        );
      }
      const { smallMoved, bigMoved, actualMovedBags, repackVariance, explicitConfirmation } = confirmed;
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

      // Source GRN pending rent remains as separate pending bills and does not reflect on target GRN.
      // Only explicit manual additionalRentAmount overrides add to the target GRN obligation.
      finalCarriedRent =
        input.additionalRentAmount != null && input.additionalRentAmount > 0
          ? input.additionalRentAmount
          : 0;

      const repackHamali = await resolveMergeRepackHamali({
        commodityId: targetGrn.commodityId,
        isRepackSelected: input.isRepackSelected,
        repackedSmallBags: input.repackedSmallBags,
        repackedBigBags: input.repackedBigBags,
        repackedBagCount: input.repackedBagCount,
        totalMovedBags: actualMovedBags,
        session,
      });
      repackHamaliCharge = repackHamali.repackHamaliCharge;

      const newBags = targetGrn.bags + actualMovedBags;
      const newSmall = targetGrn.smallBags + totalMovedSmall;
      const newBig = targetGrn.bigBags + totalMovedBig;
      const newRentAmount = Number((targetGrn.rentAmount + finalCarriedRent).toFixed(2));
      const effectiveSourceBagTypes =
        input.sourceBagCategory === 'Hybrid' || input.sourceBagType === 'Hybrid'
          ? ['Hybrid' as const]
          : sourceGrns.map((s) => s.bagType);
      const resultingBagType = resolveMergedBagType({
        targetBagType: targetGrn.bagType,
        sourceBagTypes: effectiveSourceBagTypes,
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
      const varianceNote = repackVariance !== 0 ? `; Variance from ${totalMovedBags} source bags: ${repackVariance > 0 ? `+${repackVariance}` : repackVariance} bags` : '';
      const repackedNote = input.repackedSmallBags != null ? ` (Repacked: ${totalMovedSmall} S + ${totalMovedBig} B = ${actualMovedBags} bags${varianceNote})` : '';
      const repackHamaliNote = repackHamali.repackHamaliCharge > 0 ? `. Repacking Hamali: ₹${repackHamali.repackHamaliCharge} (${repackHamali.repackHamaliBags} bags @ ₹${repackHamali.repackHamaliRate}/bag)` : '';
      const categoryNote =
        input.sourceBagCategory != null && isHybridBagCategory(input.sourceBagCategory)
          ? ` (Confirmed Hybrid: ${actualMovedBags} bags${varianceNote})`
          : '';
      const carriedRentNote = finalCarriedRent > 0 ? `. Additional rent: ₹${finalCarriedRent}` : '';
      const sourceBillsNote = totalSourcePendingRent > 0 ? `. Source pending rent: ₹${totalSourcePendingRent} kept as separate pending bills` : '';
      const targetNote = `[MERGE RECEIVED on ${moveDateStr}: +${actualMovedBags} bags${repackedNote}${repackHamaliNote}${categoryNote} from ${sourceSummaries.join('; ')}${carriedRentNote}${sourceBillsNote}. Reason: ${input.remarks.trim()}]`;
      const updatedTargetRemarks = appendGrnRemarks(targetGrn.remarks, targetNote);

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
        totalMovedBags: actualMovedBags, totalMovedSmall, totalMovedBig, newRentAmount,
        targetPaid, targetRentBal,
        hamaliBags: repackHamali.repackHamaliBags,
        hamaliRate: repackHamali.repackHamaliRate,
        hamaliCharge: repackHamali.repackHamaliCharge,
        repackVariance, repackSourceBags: totalMovedBags,
        input, userId, session,
        idempotencyKey: input.idempotencyKey ?? null,
      });
    }),
    );
  } finally {
    await session.endSession();
  }

  const movementRecord = resultMovementDoc as InternalMovementRecord;
  const targetEntity = toGrnEntity(resultTargetDoc as import('../../../database/models/grn.model.js').GrnDoc);

  if (!idempotentHit) {
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
  }

  return { targetGrn: targetEntity, movement: movementRecord };
}
