import mongoose from 'mongoose';
import { randomUUID } from 'node:crypto';
import {
  appendGrnRemarks, isHybridBagCategory,
  resolveStoredCompositionVerified,
  type TransferOwnershipInput, type Grn, type InternalMovementRecord, type RentPayment,
} from '@cold-storage/contracts';
import { CustomerModel } from '../../../database/models/customer.model.js';
import { GrnModel } from '../../../database/models/grn.model.js';
import { readLedgerBalance } from '../../inventory/ledger-balance.js';
import { auditService } from '../../audit/audit.service.js';
import { toGrnEntity } from '../../grn/grn.mappers.js';
import { withMongoRetry } from '../../common/mongo-retry.helper.js';
import { toEqId } from '../../../utils/query-sanitizer.js';
import { counterService } from '../../common/counter.service.js';
import {
  alignTransferLedger,
  buildTransferGrnUpdateFields,
  calculateTransferDues,
  createTransferMovement,
  formatTransferAuditNote,
  settleTransferRent,
} from './transfer-ownership.helper.js';
import { validateTransferBagConfirmation, validateTransferRepack } from './transfer-ownership-validation.helper.js';

export async function transferOwnership(
  facilityId: string,
  input: TransferOwnershipInput,
  userId: string,
): Promise<{ grn: Grn; movement: InternalMovementRecord; payment?: RentPayment }> {
  const session = await mongoose.startSession();
  let resultGrnDoc!: unknown;
  let resultMovementDoc!: unknown;
  let resultPayment: RentPayment | undefined;
  let previousStock = { total: 0, smallBags: 0, bigBags: 0 };

  try {
    await withMongoRetry(() =>
      session.withTransaction(async () => {
      const grn = await GrnModel.findOne({ id: toEqId(input.grnId), facilityId: toEqId(facilityId) }, null, { session })
        .lean()
        .exec();
      if (!grn) throw new Error(`GRN '${input.grnId}' not found in facility '${facilityId}'`);
      if (grn.status === 'CLOSED') throw new Error(`Cannot transfer ownership of CLOSED GRN '${grn.grnNumber}'`);
      if (grn.loanStatus === 'TAKEN') throw new Error(`Cannot transfer ownership: Active loan hold against GRN '${grn.grnNumber}'`);
      if (grn.customerId === input.newCustomerId) throw new Error('New customer must be different from current customer');

      const newCustomer = await CustomerModel.findOne({ id: toEqId(input.newCustomerId) }, null, { session })
        .lean()
        .exec();
      if (!newCustomer) throw new Error(`Customer '${input.newCustomerId}' not found`);
      if (!newCustomer.isActive) throw new Error(`Customer '${newCustomer.name}' is inactive`);
      if (!newCustomer.facilityIds.includes(facilityId)) throw new Error(`Customer '${newCustomer.name}' is not assigned to facility '${facilityId}'`);

      const bal = await readLedgerBalance(facilityId, grn.id, session);
      if (bal.total <= 0) {
        throw new Error(`Cannot transfer ownership: No stock remaining in GRN '${grn.grnNumber}'`);
      }
      previousStock = { total: bal.total, smallBags: bal.smallBags, bigBags: bal.bigBags };

      // Unverified lots must not transfer silently; verified lots stay compatible.
      const isVerified = resolveStoredCompositionVerified({
        isCompositionVerified: grn.isCompositionVerified ?? null,
        bagType: grn.bagType,
        bags: grn.bags,
        smallBags: grn.smallBags,
        bigBags: grn.bigBags,
      });
      validateTransferBagConfirmation(input, bal.total, grn.grnNumber, isVerified);
      validateTransferRepack(input, bal.total, grn.grnNumber);

      const movementDate = new Date(input.movementDate);
      const isHybrid = input.sourceBagType === 'Hybrid' || grn.bagType === 'Hybrid' || isHybridBagCategory(input.sourceBagCategory);
      const confSmall = isHybrid ? bal.total : (typeof input.confirmedSmallBags === 'number' ? input.confirmedSmallBags : bal.smallBags);
      const confBig = isHybrid ? 0 : (typeof input.confirmedBigBags === 'number' ? input.confirmedBigBags : bal.bigBags);

      const { effectiveObligation, transferCommodity, totalDue, totalPaid, rentBal } =
        await calculateTransferDues({
          facilityId, grn, bal, confSmall, confBig, isHybrid, movementDate, input, session,
        });

      // 2. Settlement gate: Settles dues under SETTLE_NOW or carries forward under AGREED_PENDING
      const { paymentRecord, effectiveRentBal } = await settleTransferRent({
        facilityId, grnId: grn.id, grnNumber: grn.grnNumber,
        sourceCustomerId: grn.customerId, sourceCustomerName: grn.customerName,
        newCustomerName: newCustomer.name, movementDate, totalDue, totalPaid,
        rentBal, input, userId, session,
      });

      const movementId = `mov-${randomUUID()}`;
      // Repacking / Rebagging during Ownership Transfer:
      // If the buyer/seller agreed on physical rebagging as part of the ownership transfer,
      // the resulting bag composition and counts are applied. Otherwise, the confirmed stock
      // composition is retained.
      const isRepackedHybrid = input.resultingBagType === 'Hybrid' || (!input.resultingBagType && isHybrid);
      const resultingBagType = input.resultingBagType ?? (isHybrid ? 'Hybrid' : 'S/B');
      const finalSmall = isRepackedHybrid
        ? (input.repackedQuantity ?? confSmall)
        : (typeof input.repackedSmallBags === 'number' ? input.repackedSmallBags : confSmall);
      const finalBig = isRepackedHybrid
        ? 0
        : (typeof input.repackedBigBags === 'number' ? input.repackedBigBags : confBig);
      const finalChamber = input.destinationChamber ? input.destinationChamber.trim() : grn.chamber;

      // Align inventory ledger: atomically decants original stock and puts away confirmed/repacked stock
      await alignTransferLedger({
        facilityId, grn, movementId, movementDate, userId, bal,
        confSmall: finalSmall, confBig: finalBig, resultingBagType,
        destinationChamber: finalChamber, session,
      });

      const transferInvoiceNumber = await counterService.generateTransferInvoiceNumber(
        facilityId,
        movementDate,
        session,
      );
      const transferFeePerBag = input.transferFeePerBag ?? 0;
      const transferFeeCharged =
        input.totalTransferFee != null
          ? input.totalTransferFee
          : (transferFeePerBag > 0 ? transferFeePerBag * bal.total : 0);
      const feePayer = input.feePaidBy ?? null;

      const transferDateStr = movementDate.toISOString().split('T')[0];
      const transferNote = formatTransferAuditNote({
        transferDateStr,
        fromName: grn.customerName,
        fromId: grn.customerId,
        toName: newCustomer.name,
        toId: newCustomer.id,
        totalBags: finalSmall + finalBig,
        smallBags: finalSmall,
        bigBags: finalBig,
        bagType: resultingBagType,
        transferInvoiceNumber,
        transferFeeCharged,
        feePayer,
        paymentRecord,
        effectiveRentBal,
        remarks: input.remarks,
      });
      const updatedRemarks = appendGrnRemarks(grn.remarks, transferNote);

      const updateFields = buildTransferGrnUpdateFields({
        newCustomer, finalChamber, resultingBagType,
        finalBags: finalSmall + finalBig, finalSmall, finalBig,
        updatedRemarks, referenceWeight: input.referenceWeight,
        effectiveObligation, isHybrid, input,
      });

      const updatedGrn = await GrnModel.findOneAndUpdate(
        { id: grn.id },
        { $set: updateFields },
        { session, new: true },
      ).lean().exec();

      resultGrnDoc = updatedGrn;
      resultPayment = paymentRecord;

      resultMovementDoc = await createTransferMovement({
        movementId, facilityId, input, grn, newCustomer, bal,
        finalSmall, finalBig, finalChamber, resultingBagType,
        isRepackedHybrid, transferCommodity,
        transferInvoiceNumber, transferFeeCharged, feePayer,
        effectiveRentBal,
        userId, session,
      });
    }),
    );
  } finally {
    await session.endSession();
  }

  const movementRecord = resultMovementDoc as InternalMovementRecord;
  const grnEntity = toGrnEntity(resultGrnDoc as import('../../../database/models/grn.model.js').GrnDoc);

  await auditService.log({
    eventType: 'INTERNAL_MOVEMENT_TRANSFER',
    severity: 'INFO',
    userId,
    facilityId,
    resource: 'grn',
    resourceId: grnEntity.id,
    details: {
      activityDate: movementRecord.movementDate instanceof Date
        ? movementRecord.movementDate.toISOString().split('T')[0]
        : String(movementRecord.movementDate).split('T')[0],
      grnNumber: grnEntity.grnNumber,
      transactionType: 'TRANSFER_OWNERSHIP',
      fromCustomerId: movementRecord.fromCustomerId ?? null, fromCustomer: movementRecord.fromCustomerName,
      toCustomerId: movementRecord.toCustomerId ?? input.newCustomerId, toCustomer: movementRecord.toCustomerName,
      confirmedSmallBags: input.confirmedSmallBags ?? null, confirmedBigBags: input.confirmedBigBags ?? null,
      sourceBagCategory: input.sourceBagCategory ?? null, sourceQuantity: input.sourceQuantity ?? null,
      previousStock,
      confirmedBagComposition: { smallBags: input.confirmedSmallBags ?? null, bigBags: input.confirmedBigBags ?? null, quantity: input.sourceQuantity ?? null },
      newStockComposition: { total: movementRecord.totalBagsMoved, smallBags: movementRecord.smallBagsMoved, bigBags: movementRecord.bigBagsMoved, bagType: movementRecord.resultingBagType },
      transferInvoiceNumber: movementRecord.transferInvoiceNumber ?? null,
      transferFeeCharged: movementRecord.transferFeeCharged ?? 0,
      feePayer: movementRecord.feePayer ?? null,
      billReferences: {
        receiptNumber: resultPayment?.receiptNumber ?? null,
        amountPaid: resultPayment?.amountPaid ?? 0,
        paymentDecision: input.paymentDecision,
        hamaliCharge: movementRecord.hamaliCharge ?? 0,
        transferInvoiceNumber: movementRecord.transferInvoiceNumber ?? null,
        transferFeeCharged: movementRecord.transferFeeCharged ?? 0,
      },
      pendingRent: movementRecord.financialSnapshot.remainingBalance, paymentDecision: input.paymentDecision,
      receiptNumber: resultPayment?.receiptNumber ?? null, amountPaidAtTransfer: resultPayment?.amountPaid ?? 0,
      remarks: input.remarks,
    },
  });

  return { grn: grnEntity, movement: movementRecord, payment: resultPayment };
}
