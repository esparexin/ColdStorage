import mongoose from 'mongoose';
import { randomUUID } from 'node:crypto';
import type { MergeGrnInput, Grn, InternalMovementRecord } from '@cold-storage/contracts';
import { GrnModel } from '../../../database/models/grn.model.js';
import { InventoryTransactionModel } from '../../../database/models/inventory-transaction.model.js';
import { RentPaymentModel } from '../../../database/models/rent-payment.model.js';
import { InternalMovementModel } from '../../../database/models/internal-movement.model.js';
import { computeRentBalance } from '../../common/rent-balance.js';
import { readLedgerBalance } from '../../inventory/ledger-balance.js';
import { auditService } from '../../audit/audit.service.js';
import { toGrnEntity } from '../../grn/grn.mappers.js';

export async function mergeGrn(
  facilityId: string,
  input: MergeGrnInput,
  userId: string,
): Promise<{ targetGrn: Grn; movement: InternalMovementRecord }> {
  if (input.sourceGrnIds.includes(input.targetGrnId)) {
    throw new Error('Target GRN cannot be included in source GRNs list');
  }

  const session = await mongoose.startSession();
  let resultTargetDoc!: unknown;
  let resultMovementDoc!: unknown;

  try {
    await session.withTransaction(async () => {
      const targetGrn = await GrnModel.findOne({ id: input.targetGrnId, facilityId }, null, { session })
        .lean()
        .exec();
      if (!targetGrn) {
        throw new Error(`Target GRN '${input.targetGrnId}' not found in facility '${facilityId}'`);
      }
      if (targetGrn.status === 'CLOSED') {
        throw new Error(`Cannot merge into CLOSED GRN '${targetGrn.grnNumber}'`);
      }
      if (targetGrn.loanStatus === 'TAKEN') {
        throw new Error(`Target GRN '${targetGrn.grnNumber}' has an active loan hold`);
      }

      const sourceGrns = await GrnModel.find(
        { id: { $in: input.sourceGrnIds }, facilityId },
        null,
        { session },
      )
        .lean()
        .exec();

      if (sourceGrns.length !== input.sourceGrnIds.length) {
        throw new Error('One or more source GRNs were not found in this facility');
      }

      const movementId = `mov-${randomUUID()}`;
      let totalMovedBags = 0;
      let totalMovedSmall = 0;
      let totalMovedBig = 0;
      const sourceSummaries: string[] = [];

      for (const s of sourceGrns) {
        if (s.status === 'CLOSED') {
          throw new Error(`Source GRN '${s.grnNumber}' is already CLOSED`);
        }
        if (s.commodityId !== targetGrn.commodityId) {
          throw new Error(
            `Commodity mismatch: Source GRN '${s.grnNumber}' (${s.commodityName}) does not match Target GRN '${targetGrn.grnNumber}' (${targetGrn.commodityName})`,
          );
        }
        if (s.loanStatus === 'TAKEN') {
          throw new Error(`Source GRN '${s.grnNumber}' has an active loan hold`);
        }

        const bal = await readLedgerBalance(facilityId, s.id, session);
        if (bal.total <= 0) {
          throw new Error(`Source GRN '${s.grnNumber}' has zero remaining bags to merge`);
        }

        const payments = await RentPaymentModel.find({ facilityId, grnId: s.id }, null, { session })
          .lean()
          .exec();
        const totalPaid = payments.reduce((sum, p) => sum + p.amountPaid, 0);
        const rentBal = computeRentBalance(s.rentAmount, totalPaid);

        totalMovedBags += bal.total;
        totalMovedSmall += bal.smallBags;
        totalMovedBig += bal.bigBags;

        const inwardDateStr = new Date(s.date).toISOString().split('T')[0];
        sourceSummaries.push(
          `GRN ${s.grnNumber} (Receipt #${s.inwardReceiptNumber}, Date: ${inwardDateStr}, Customer: ${s.customerName}, Bags: ${bal.total}, Rent: ₹${s.rentAmount}, Paid: ₹${totalPaid}, Balance: ₹${rentBal.remainingBalance}, Status: ${rentBal.paymentStatus})`,
        );

        await InventoryTransactionModel.create(
          [
            {
              id: `tx-${randomUUID()}`,
              facilityId,
              grnId: s.id,
              grnNumber: s.grnNumber,
              chamber: s.chamber,
              commodityId: s.commodityId,
              bagType: s.bagType,
              transactionType: 'OUTWARD_DELIVERY',
              smallQuantity: bal.smallBags,
              bigQuantity: bal.bigBags,
              referenceType: 'DELIVERY',
              referenceId: movementId,
              notes: `Merged into GRN ${targetGrn.grnNumber}: ${input.remarks.trim()}`,
              createdBy: userId,
              createdAt: input.movementDate,
            },
          ],
          { session, ordered: true },
        );

        const moveDateStr = new Date(input.movementDate).toISOString().split('T')[0];
        const sourceNote = `[MERGED into GRN ${targetGrn.grnNumber} on ${moveDateStr}: ${bal.total} bags cleared. Financial record preserved: Rent Obligation ₹${s.rentAmount}, Paid ₹${totalPaid}, Pending ₹${rentBal.remainingBalance} (Status: ${rentBal.paymentStatus}). Customer: ${s.customerName}. Reason: ${input.remarks.trim()}]`;
        const updatedSourceRemarks = s.remarks ? `${s.remarks}\n${sourceNote}` : sourceNote;

        await GrnModel.updateOne(
          { id: s.id },
          { $set: { status: 'CLOSED', remarks: updatedSourceRemarks, updatedAt: new Date() } },
          { session },
        );
      }

      await InventoryTransactionModel.create(
        [
          {
            id: `tx-${randomUUID()}`,
            facilityId,
            grnId: targetGrn.id,
            grnNumber: targetGrn.grnNumber,
            chamber: targetGrn.chamber,
            commodityId: targetGrn.commodityId,
            bagType: targetGrn.bagType,
            transactionType: 'INWARD_PUTAWAY',
            smallQuantity: totalMovedSmall,
            bigQuantity: totalMovedBig,
            referenceType: 'PUT_AWAY',
            referenceId: movementId,
            notes: `Merged from GRNs ${sourceGrns.map((s) => s.grnNumber).join(', ')}: ${input.remarks.trim()}`,
            createdBy: userId,
            createdAt: input.movementDate,
          },
        ],
        { session, ordered: true },
      );

      const targetNote = `[MERGE RECEIVED on ${new Date(input.movementDate).toISOString().split('T')[0]}: +${totalMovedBags} bags from ${sourceSummaries.join('; ')}. Reason: ${input.remarks.trim()}]`;
      const updatedTargetRemarks = targetGrn.remarks ? `${targetGrn.remarks}\n${targetNote}` : targetNote;

      const newBags = targetGrn.bags + totalMovedBags;
      const newSmall = targetGrn.smallBags + totalMovedSmall;
      const newBig = targetGrn.bigBags + totalMovedBig;
      const newRentAmount = targetGrn.rentAmount + (input.additionalRentAmount ?? 0);

      const updatedTarget = await GrnModel.findOneAndUpdate(
        { id: targetGrn.id },
        {
          $set: {
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

      const targetPayments = await RentPaymentModel.find({ facilityId, grnId: targetGrn.id }, null, { session })
        .lean()
        .exec();
      const targetPaid = targetPayments.reduce((sum, p) => sum + p.amountPaid, 0);
      const targetRentBal = computeRentBalance(newRentAmount, targetPaid);

      const movementDocs = await InternalMovementModel.create(
        [
          {
            id: movementId,
            facilityId,
            movementType: 'MERGE',
            movementDate: input.movementDate,
            targetGrnId: targetGrn.id,
            targetGrnNumber: targetGrn.grnNumber,
            sourceGrnIds: sourceGrns.map((s) => s.id),
            sourceGrnNumbers: sourceGrns.map((s) => s.grnNumber),
            totalBagsMoved: totalMovedBags,
            smallBagsMoved: totalMovedSmall,
            bigBagsMoved: totalMovedBig,
            financialSnapshot: {
              rentAmount: newRentAmount,
              totalPaid: targetPaid,
              remainingBalance: targetRentBal.remainingBalance,
              paymentStatus: targetRentBal.paymentStatus,
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
      remarks: input.remarks,
    },
  });

  return { targetGrn: targetEntity, movement: movementRecord };
}
