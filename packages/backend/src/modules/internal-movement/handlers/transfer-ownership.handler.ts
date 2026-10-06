import mongoose from 'mongoose';
import { randomUUID } from 'node:crypto';
import type { TransferOwnershipInput, Grn, InternalMovementRecord } from '@cold-storage/contracts';
import { CustomerModel } from '../../../database/models/customer.model.js';
import { GrnModel } from '../../../database/models/grn.model.js';
import { RentPaymentModel } from '../../../database/models/rent-payment.model.js';
import { InternalMovementModel } from '../../../database/models/internal-movement.model.js';
import { computeRentBalance } from '../../common/rent-balance.js';
import { readLedgerBalance } from '../../inventory/ledger-balance.js';
import { rentExtensionRepository } from '../../rent/rent-extension.repository.js';
import { auditService } from '../../audit/audit.service.js';
import { toGrnEntity } from '../../grn/grn.mappers.js';

export async function transferOwnership(
  facilityId: string,
  input: TransferOwnershipInput,
  userId: string,
): Promise<{ grn: Grn; movement: InternalMovementRecord }> {
  const session = await mongoose.startSession();
  let resultGrnDoc!: unknown;
  let resultMovementDoc!: unknown;

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

      const payments = await RentPaymentModel.find({ facilityId, grnId: grn.id }, null, { session })
        .lean()
        .exec();
      const totalPaid = payments.reduce((sum, p) => sum + p.amountPaid, 0);
      const totalDue = await rentExtensionRepository.resolveTotalDue(
        facilityId,
        { id: grn.id, rentAmount: grn.rentAmount ?? 0 },
        session,
      );
      const rentBal = computeRentBalance(totalDue, totalPaid);
      const bal = await readLedgerBalance(facilityId, grn.id, session);

      const movementId = `mov-${randomUUID()}`;
      const transferDateStr = new Date(input.movementDate).toISOString().split('T')[0];
      const transferNote = `[OWNERSHIP TRANSFERRED on ${transferDateStr}: from ${grn.customerName} (ID: ${grn.customerId}) to ${newCustomer.name} (ID: ${newCustomer.id}). Pending rent: ₹${rentBal.remainingBalance} of ₹${rentBal.rentAmount} (Prior collected: ₹${rentBal.totalPaid}). Reason: ${input.remarks.trim()}]`;
      const updatedRemarks = grn.remarks ? `${grn.remarks}\n${transferNote}` : transferNote;

      const updatedGrn = await GrnModel.findOneAndUpdate(
        { id: grn.id },
        {
          $set: {
            customerId: newCustomer.id,
            customerName: newCustomer.name,
            remarks: updatedRemarks,
            updatedAt: new Date(),
          },
        },
        { session, new: true },
      )
        .lean()
        .exec();

      resultGrnDoc = updatedGrn;

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
            financialSnapshot: {
              rentAmount: rentBal.rentAmount,
              totalPaid: rentBal.totalPaid,
              remainingBalance: rentBal.remainingBalance,
              paymentStatus: rentBal.paymentStatus,
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
      remarks: input.remarks,
    },
  });

  return { grn: grnEntity, movement: movementRecord };
}
