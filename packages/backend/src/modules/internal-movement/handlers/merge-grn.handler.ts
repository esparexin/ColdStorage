import mongoose from 'mongoose';
import { randomUUID } from 'node:crypto';
import {
  isHybridBagCategory, resolveEffectiveGrnRentType, resolveMergedBagType,
  resolveStoredCompositionVerified, type Grn, type InternalMovementRecord,
  type MergeGrnInput, type RentPayment,
} from '@cold-storage/contracts';
import { GrnModel } from '../../../database/models/grn.model.js';
import { InternalMovementModel } from '../../../database/models/internal-movement.model.js';
import { counterService } from '../../common/counter.service.js';
import { rentRepository } from '../../rent/rent.repository.js';
import { resolveMovementObligation } from './resolve-movement-obligation.js';
import { computeRentBalance } from '../../common/rent-balance.js';
import { readLedgerBalance } from '../../inventory/ledger-balance.js';
import { auditService } from '../../audit/audit.service.js';
import { toGrnEntity } from '../../grn/grn.mappers.js';
import { validateProspectiveMergeMove, processMergeSource, settleTargetHamaliPayment } from './merge-source-move.helper.js';
import { withMongoRetry } from '../../common/mongo-retry.helper.js';
import { toEqId } from '../../../utils/query-sanitizer.js';
import { createMergePutawayTransaction, createMergeMovementRecord, resolveMergeTargetRentAmount } from './merge-grn-movement.helper.js';
import { buildMergeTargetUpdates } from './merge-grn-remarks.helper.js';
import { resolveMergeRepackHamali, generateMergeHamaliCashMemo } from './merge-repack-hamali.helper.js';
import { validateOperationalDate } from '../../common/operational-date.helper.js';

export async function mergeGrn(
  facilityId: string,
  input: MergeGrnInput,
  userId: string,
): Promise<{ targetGrn: Grn; movement: InternalMovementRecord; payment?: RentPayment }> {
  if (input.sourceGrnIds.includes(input.targetGrnId)) throw new Error('Target GRN cannot be included in source GRNs list');
  if (new Set(input.sourceGrnIds).size !== input.sourceGrnIds.length) throw new Error('Duplicate source GRN IDs are not allowed');

  const session = await mongoose.startSession();
  let resultTargetDoc!: unknown;
  let resultMovementDoc!: unknown;
  let resultPaymentDoc: RentPayment | undefined;
  let finalCarriedRent = 0;
  let repackHamaliCharge = 0;
  let totalSourcePendingRent = 0;
  let idempotentHit = false;
  let previousStock = { targetStock: 0, targetSmallBags: 0, targetBigBags: 0, totalSourceBags: 0 };

  try {
    await withMongoRetry(() =>
      session.withTransaction(async () => {
      if (input.idempotencyKey) {
        const existing = await InternalMovementModel.findOne({ facilityId: toEqId(facilityId), idempotencyKey: toEqId(input.idempotencyKey) }, null, { session }).lean().exec();
        if (existing) {
          const existingTarget = await GrnModel.findOne({ id: existing.targetGrnId, facilityId }, null, { session }).lean().exec();
          if (existingTarget) {
            resultTargetDoc = existingTarget;
            resultMovementDoc = existing as unknown as InternalMovementRecord;
            idempotentHit = true;
            return;
          }
        }
      }

      const targetGrn = await GrnModel.findOne({ id: toEqId(input.targetGrnId), facilityId: toEqId(facilityId) }, null, { session }).lean().exec();
      if (!targetGrn) throw new Error(`Target GRN '${input.targetGrnId}' not found in facility '${facilityId}'`);
      if (targetGrn.status === 'CLOSED') throw new Error(`Cannot merge into CLOSED GRN '${targetGrn.grnNumber}'`);
      if (targetGrn.loanStatus === 'TAKEN') throw new Error(`Target GRN '${targetGrn.grnNumber}' has an active loan hold`);
      const targetBal = await readLedgerBalance(facilityId, targetGrn.id, session);
      if (targetBal.total <= 0) throw new Error(`Cannot merge into Target GRN '${targetGrn.grnNumber}' with zero remaining stock`);
      previousStock.targetStock = targetBal.total;
      previousStock.targetSmallBags = targetBal.smallBags;
      previousStock.targetBigBags = targetBal.bigBags;

      const sourceGrns = await GrnModel.find({ id: { $in: input.sourceGrnIds }, facilityId }, null, { session }).lean().exec();
      if (sourceGrns.length !== input.sourceGrnIds.length) {
        throw new Error('One or more source GRNs were not found in this facility');
      }

      const movementId = `mov-${randomUUID()}`;
      let totalMovedBags = 0;
      let totalMovedSmall = 0;
      let totalMovedBig = 0;
      totalSourcePendingRent = 0;
      const sourceSummaries: string[] = [];
      const moveDate = validateOperationalDate(input.movementDate, { label: 'Merge' });
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
      previousStock.totalSourceBags = totalMovedBags;
      if (remainingPaymentPool > 0.01) {
        const targetSettlement = await settleTargetHamaliPayment({
          facilityId, targetGrn, moveDate, allocatedPayment: remainingPaymentPool,
          paymentMode: input.sourcePaymentMode, userId, session,
        });
        remainingPaymentPool = Math.max(0, Number((remainingPaymentPool - targetSettlement.paidAmount).toFixed(2)));
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
      const targetConfirmed = (input.targetSmallBags != null && input.targetBigBags != null) ||
        isHybridBagCategory(input.targetBagCategory) || input.targetBagType === 'Hybrid';
      const newIsCompositionVerified = explicitConfirmation ? true : (targetWasVerified || targetConfirmed) && allSourcesVerified;

      // Source GRN pending rent strictly remains as separate pending bills on source GRNs.
      // Never carried forward to the surviving target GRN.
      finalCarriedRent = 0;

      const repackHamali = await resolveMergeRepackHamali({
        commodityId: targetGrn.commodityId, targetHamaliRate: targetGrn.hamaliRate,
        isRepackSelected: input.isRepackSelected,
        repackedSmallBags: input.repackedSmallBags, repackedBigBags: input.repackedBigBags,
        repackedBagCount: input.repackedBagCount, totalMovedBags: actualMovedBags, session,
      });
      repackHamaliCharge = repackHamali.repackHamaliCharge;

      const baseTSmall = input.targetSmallBags != null ? input.targetSmallBags : (targetWasVerified ? targetGrn.smallBags : targetGrn.bags);
      const baseTBig = input.targetBigBags != null ? input.targetBigBags : (targetWasVerified ? targetGrn.bigBags : 0);
      const newBags = input.isRepackSelected ? actualMovedBags : targetGrn.bags + actualMovedBags;
      const newSmall = input.isRepackSelected ? totalMovedSmall : baseTSmall + totalMovedSmall;
      const newBig = input.isRepackSelected ? totalMovedBig : baseTBig + totalMovedBig;
      const isRepackedHybrid = Boolean(input.isRepackSelected &&
        (input.sourceBagCategory === 'Hybrid' || input.sourceBagType === 'Hybrid' || input.targetBagCategory === 'Hybrid' || input.targetBagType === 'Hybrid'));
      const effectiveSourceBagTypes = isRepackedHybrid ? ['Hybrid' as const] : sourceGrns.map((s) => s.bagType);
      const resultingBagType = isRepackedHybrid ? 'Hybrid' : resolveMergedBagType({
        targetBagType: targetGrn.bagType, sourceBagTypes: effectiveSourceBagTypes,
        newSmallBags: newSmall, newBigBags: newBig,
      });
      const newRentAmount = resolveMergeTargetRentAmount({
        isRepackSelected: input.isRepackSelected, actualMovedBags, resultingBagType,
        newSmall, newBig, targetGrn, finalCarriedRent,
      });

      const destinationChamber = input.destinationChamber?.trim() || targetGrn.chamber;

      await createMergePutawayTransaction({
        facilityId, movementId, moveDate, targetGrn: { ...targetGrn, chamber: destinationChamber },
        resultingBagType, sourceGrns, totalMovedSmall, totalMovedBig, remarks: input.remarks, userId, session,
        isRepackSelected: input.isRepackSelected,
        decantSmall: input.isRepackSelected ? previousStock.targetSmallBags : undefined,
        decantBig: input.isRepackSelected ? previousStock.targetBigBags : undefined,
      });

      const mergeInvoiceNumber = await counterService.generateMergeInvoiceNumber(facilityId, moveDate, session);

      const { targetUpdateFields } = buildMergeTargetUpdates({
        destinationChamber, resultingBagType, newBags, newSmall, newBig,
        newIsCompositionVerified, newRentAmount, moveDate, actualMovedBags,
        totalMovedBags, totalMovedSmall, totalMovedBig, repackVariance,
        repackHamaliCharge: repackHamali.repackHamaliCharge,
        repackHamaliBags: repackHamali.repackHamaliBags,
        repackHamaliRate: repackHamali.repackHamaliRate,
        finalCarriedRent, totalSourcePendingRent, sourceSummaries,
        mergeInvoiceNumber, targetGrn, input,
      });

      const updatedTarget = await GrnModel.findOneAndUpdate(
        { id: targetGrn.id },
        { $set: targetUpdateFields },
        { session, new: true },
      ).lean().exec();

      resultTargetDoc = updatedTarget;

      const hamaliPayment = await generateMergeHamaliCashMemo({
        facilityId, targetGrn, repackHamali, moveDate,
        paymentMode: input.sourcePaymentMode ?? 'Cash',
        userId, session,
      });
      if (hamaliPayment) resultPaymentDoc = hamaliPayment;

      const targetPaid = (await rentRepository.findPaymentsByGrnId(facilityId, targetGrn.id, session))
        .reduce((sum, p) => sum + p.amountPaid, 0);
      const effectiveTargetRentType = resolveEffectiveGrnRentType({ rentType: targetGrn.rentType, inwardDate: targetGrn.date, asOfDate: moveDate });
      const target = {
        id: targetGrn.id, rentAmount: newRentAmount, rentType: effectiveTargetRentType,
        hamaliShare: (targetUpdateFields.hamaliAmount as number | undefined) ?? repackHamali.repackHamaliCharge,
      };
      const targetTotalDue = await resolveMovementObligation(facilityId, target, session);
      const targetRentBal = computeRentBalance(targetTotalDue, targetPaid);

      resultMovementDoc = await createMergeMovementRecord({
        facilityId, movementId, moveDate, targetGrn, sourceGrns,
        totalMovedBags: actualMovedBags, totalMovedSmall, totalMovedBig, newRentAmount,
        targetPaid, targetRentBal,
        hamaliBags: repackHamali.repackHamaliBags, hamaliRate: repackHamali.repackHamaliRate, hamaliCharge: repackHamali.repackHamaliCharge,
        repackVariance, repackSourceBags: totalMovedBags, mergeInvoiceNumber, carriedRentAmount: finalCarriedRent,
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
      eventType: 'INTERNAL_MOVEMENT_MERGE', severity: 'INFO', userId, facilityId,
      resource: 'grn', resourceId: targetEntity.id,
      details: {
        activityDate: movementRecord.movementDate instanceof Date
          ? movementRecord.movementDate.toISOString().split('T')[0]
          : String(movementRecord.movementDate).split('T')[0],
        targetGrnNumber: targetEntity.grnNumber, customerId: targetEntity.customerId, customerName: targetEntity.customerName,
        sourceGrnNumbers: movementRecord.sourceGrnNumbers, totalBagsMoved: movementRecord.totalBagsMoved,
        transactionType: 'MERGE', previousStock,
        confirmedBagComposition: { totalMovedBags: movementRecord.totalBagsMoved, smallBagsMoved: movementRecord.smallBagsMoved, bigBagsMoved: movementRecord.bigBagsMoved, category: movementRecord.sourceBagCategory ?? null },
        newStockComposition: { totalBags: targetEntity.bags, smallBags: targetEntity.smallBags, bigBags: targetEntity.bigBags, bagType: targetEntity.bagType },
        billReferences: { movementId: movementRecord.id, mergeInvoiceNumber: movementRecord.mergeInvoiceNumber, carriedRent: finalCarriedRent, repackHamaliCharge, sourcePendingRent: totalSourcePendingRent },
        smallBagsMoved: movementRecord.smallBagsMoved, bigBagsMoved: movementRecord.bigBagsMoved,
        isCompositionVerified: targetEntity.isCompositionVerified, repackVariance: movementRecord.repackVariance ?? 0,
        carriedRent: finalCarriedRent, repackHamaliCharge, newRentAmount: movementRecord.financialSnapshot.rentAmount,
        sourceBagCategory: movementRecord.sourceBagCategory ?? null, referenceWeight: input.referenceWeight ?? null, remarks: input.remarks,
      },
    });
  }

  return { targetGrn: targetEntity, movement: movementRecord, payment: resultPaymentDoc };
}
