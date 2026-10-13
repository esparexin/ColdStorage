import mongoose from 'mongoose';
import { randomUUID } from 'node:crypto';
import type { TransferOwnershipInput, Grn, InternalMovementRecord, RentPayment } from '@cold-storage/contracts';
import { CustomerModel } from '../../../database/models/customer.model.js';
import { GrnModel } from '../../../database/models/grn.model.js';
import { InternalMovementModel } from '../../../database/models/internal-movement.model.js';
import { computeRentBalance } from '../../common/rent-balance.js';
import { readLedgerBalance } from '../../inventory/ledger-balance.js';
import { rentExtensionRepository } from '../../rent/rent-extension.repository.js';
import { auditService } from '../../audit/audit.service.js';
import { toGrnEntity } from '../../grn/grn.mappers.js';
import { counterService } from '../../common/counter.service.js';
import { rentRepository } from '../../rent/rent.repository.js';
import { toPaymentEntity } from '../../rent/handlers/record-payment.handler.js';
import { computeExpectedDeliveryRent } from '../../delivery/handlers/delivery-rent.helper.js';
import { resolveTransferHamali } from './transfer-hamali.helper.js';

export async function transferOwnership(
  facilityId: string,
  input: TransferOwnershipInput,
  userId: string,
): Promise<{ grn: Grn; movement: InternalMovementRecord; payment?: RentPayment }> {
  const session = await mongoose.startSession();
  let resultGrnDoc!: unknown;
  let resultMovementDoc!: unknown;
  let resultPayment: RentPayment | undefined;

  try {
    await session.withTransaction(async () => {
      const grn = await GrnModel.findOne({ id: input.grnId, facilityId }, null, { session })
        .lean()
        .exec();
      if (!grn) {
        throw new Error(`GRN '${input.grnId}' not found in facility '${facilityId}'`);
      }
      if (grn.status === 'CLOSED') {
        throw new Error(`Cannot transfer ownership of CLOSED GRN '${grn.grnNumber}'`);
      }
      if (grn.loanStatus === 'TAKEN') {
        throw new Error(`Cannot transfer ownership: Active loan hold against GRN '${grn.grnNumber}'`);
      }
      if (grn.customerId === input.newCustomerId) {
        throw new Error('New customer must be different from current customer');
      }

      const newCustomer = await CustomerModel.findOne({ id: input.newCustomerId }, null, { session })
        .lean()
        .exec();
      if (!newCustomer) {
        throw new Error(`Customer '${input.newCustomerId}' not found`);
      }
      if (!newCustomer.isActive) {
        throw new Error(`Customer '${newCustomer.name}' is inactive`);
      }
      if (!newCustomer.facilityIds.includes(facilityId)) {
        throw new Error(`Customer '${newCustomer.name}' is not assigned to facility '${facilityId}'`);
      }

      const bal = await readLedgerBalance(facilityId, grn.id, session);
      if (bal.total <= 0) {
        throw new Error(`Cannot transfer ownership: No stock remaining in GRN '${grn.grnNumber}'`);
      }

      const movementDate = new Date(input.movementDate);

      // 1. Authoritative outward-style rent assessment for all remaining bags being transferred
      const { expectedRentCharge } = await computeExpectedDeliveryRent({
        grn: {
          id: grn.id,
          date: grn.date,
          rentType: grn.rentType,
          commodityId: grn.commodityId,
          smallBagPrice: grn.smallBagPrice,
          bigBagPrice: grn.bigBagPrice,
          bagPrice: grn.bagPrice,
        },
        withdrawal: {
          smallBags: bal.smallBags,
          bigBags: bal.bigBags,
        },
        deliveryDate: movementDate,
        session,
      });

      const effectiveObligation =
        expectedRentCharge > 0
          ? expectedRentCharge
          : grn.rentAmount && grn.rentAmount > 0
          ? grn.rentAmount
          : 0;

      const payments = await rentRepository.findPaymentsByGrnId(facilityId, grn.id, session);
      const totalPaid = payments.reduce((sum, p) => sum + p.amountPaid, 0);

      const totalDue = await rentExtensionRepository.resolveTotalDue(
        facilityId,
        { id: grn.id, rentAmount: effectiveObligation },
        session,
      );
      const rentBal = computeRentBalance(totalDue, totalPaid);
      let effectiveRentBal = rentBal;
      let paymentRecord: RentPayment | undefined;

      // 2. Strict settlement gate: Outstanding rent must be settled prior to ownership transfer
      if (rentBal.remainingBalance > 0) {
        if (
          input.paymentDecision !== 'SETTLE_NOW' ||
          !input.settlementDetails ||
          input.settlementDetails.amountPaid < rentBal.remainingBalance
        ) {
          throw new Error(
            `Cannot transfer ownership: Outstanding rent of ₹${rentBal.remainingBalance.toLocaleString('en-IN')} must be fully settled before transfer.`,
          );
        }

        const { amountPaid, paymentMode, paymentNotes } = input.settlementDetails;
        if (amountPaid > rentBal.remainingBalance) {
          throw new Error(
            `Requested settlement ₹${amountPaid} exceeds remaining rent balance of ₹${rentBal.remainingBalance}`,
          );
        }

        const receiptNumber = await counterService.generateRentReceiptNumber(
          facilityId,
          movementDate,
          session,
        );
        const paymentDoc = await rentRepository.createPayment(
          {
            id: `rp-${randomUUID()}`,
            facilityId,
            grnId: grn.id,
            grnNumber: grn.grnNumber,
            receiptNumber,
            amountPaid,
            paymentMode,
            paymentDate: movementDate,
            notes: paymentNotes?.trim() || `Settled upon ownership transfer to ${newCustomer.name}`,
            createdBy: userId,
          },
          session,
        );
        paymentRecord = toPaymentEntity(paymentDoc);
        effectiveRentBal = computeRentBalance(totalDue, totalPaid + amountPaid);

        if (effectiveRentBal.remainingBalance !== 0) {
          throw new Error(
            `Transfer aborted: Rent balance after settlement is ₹${effectiveRentBal.remainingBalance}, but full settlement (₹0) is required.`,
          );
        }
      }

      const movementId = `mov-${randomUUID()}`;
      const transferDateStr = movementDate.toISOString().split('T')[0];
      const transferNote = paymentRecord
        ? `[OWNERSHIP TRANSFERRED on ${transferDateStr}: from ${grn.customerName} (ID: ${grn.customerId}) to ${newCustomer.name} (ID: ${newCustomer.id}). Settled at transfer: ₹${paymentRecord.amountPaid} (Receipt #${paymentRecord.receiptNumber}). Rent obligation: ₹${effectiveRentBal.rentAmount} (Status: Settled). Reason: ${input.remarks.trim()}]`
        : `[OWNERSHIP TRANSFERRED on ${transferDateStr}: from ${grn.customerName} (ID: ${grn.customerId}) to ${newCustomer.name} (ID: ${newCustomer.id}). Rent obligation: ₹${effectiveRentBal.rentAmount} previously settled (Prior collected: ₹${effectiveRentBal.totalPaid}). Reason: ${input.remarks.trim()}]`;
      const updatedRemarks = grn.remarks ? `${grn.remarks}\n${transferNote}` : transferNote;

      const updateFields: Record<string, unknown> = {
        customerId: newCustomer.id,
        customerName: newCustomer.name,
        remarks: updatedRemarks,
        updatedAt: new Date(),
      };
      if (effectiveObligation > 0) {
        updateFields.rentAmount = effectiveObligation;
      }

      const updatedGrn = await GrnModel.findOneAndUpdate(
        { id: grn.id },
        { $set: updateFields },
        { session, new: true },
      )
        .lean()
        .exec();

      resultGrnDoc = updatedGrn;
      resultPayment = paymentRecord;
      const transferHamali = resolveTransferHamali({ hamaliRate: grn.hamaliRate ?? null, hamaliAmount: grn.hamaliAmount ?? 0 });

      const movementDocs = await InternalMovementModel.create(
        [
          {
            id: movementId,
            facilityId,
            movementType: 'TRANSFER_OWNERSHIP',
            movementDate: input.movementDate,
            grnId: grn.id,
            grnNumber: grn.grnNumber,
            fromCustomerId: grn.customerId,
            fromCustomerName: grn.customerName,
            toCustomerId: newCustomer.id,
            toCustomerName: newCustomer.name,
            totalBagsMoved: bal.total,
            smallBagsMoved: bal.smallBags,
            bigBagsMoved: bal.bigBags,
            hamaliBags: transferHamali.hamaliBags,
            hamaliRate: transferHamali.hamaliRate,
            hamaliCharge: transferHamali.hamaliCharge,
            hamaliCarried: transferHamali.hamaliCarried,
            financialSnapshot: {
              rentAmount: effectiveRentBal.rentAmount,
              totalPaid: effectiveRentBal.totalPaid,
              remainingBalance: effectiveRentBal.remainingBalance,
              paymentStatus: effectiveRentBal.paymentStatus,
              rentState: effectiveRentBal.rentState,
              hamaliAmount: transferHamali.snapshotHamali,
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
  const grnEntity = toGrnEntity(resultGrnDoc as import('../../../database/models/grn.model.js').GrnDoc);

  await auditService.log({
    eventType: 'INTERNAL_MOVEMENT_TRANSFER',
    severity: 'INFO',
    userId,
    facilityId,
    resource: 'grn',
    resourceId: grnEntity.id,
    details: {
      grnNumber: grnEntity.grnNumber,
      fromCustomer: movementRecord.fromCustomerName,
      toCustomer: movementRecord.toCustomerName,
      pendingRent: movementRecord.financialSnapshot.remainingBalance,
      hamaliCarried: movementRecord.hamaliCarried,
      hamaliAmount: movementRecord.financialSnapshot.hamaliAmount,
      paymentDecision: input.paymentDecision,
      receiptNumber: resultPayment?.receiptNumber ?? null,
      amountPaidAtTransfer: resultPayment?.amountPaid ?? 0,
      remarks: input.remarks,
    },
  });

  return { grn: grnEntity, movement: movementRecord, payment: resultPayment };
}
