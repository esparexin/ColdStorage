import mongoose from 'mongoose';
import { randomUUID } from 'node:crypto';
import { resolveStoredCompositionVerified, type TransferOwnershipInput, type Grn, type InternalMovementRecord, type RentPayment } from '@cold-storage/contracts';
import { CommodityModel } from '../../../database/models/commodity.model.js';
import { CustomerModel } from '../../../database/models/customer.model.js';
import { GrnModel } from '../../../database/models/grn.model.js';
import { InternalMovementModel } from '../../../database/models/internal-movement.model.js';
import { computeRentBalance } from '../../common/rent-balance.js';
import { computeFirstSeasonHamali } from '../../common/hamali-resolution.js';
import { readLedgerBalance } from '../../inventory/ledger-balance.js';
import { auditService } from '../../audit/audit.service.js';
import { toGrnEntity } from '../../grn/grn.mappers.js';
import { withMongoRetry } from '../../common/mongo-retry.helper.js';
import { rentRepository } from '../../rent/rent.repository.js';
import { rentExtensionRepository } from '../../rent/rent-extension.repository.js';
import { computeExpectedDeliveryRent } from '../../delivery/handlers/delivery-rent.helper.js';
import { settleTransferRent } from './transfer-ownership.helper.js';
import { validateTransferBagConfirmation } from './transfer-ownership-validation.helper.js';
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
    await withMongoRetry(() =>
      session.withTransaction(async () => {
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

      // Unverified lots must not transfer silently; verified lots stay compatible.
      const isVerified = resolveStoredCompositionVerified({
        isCompositionVerified: (grn as unknown as Record<string, unknown>).isCompositionVerified as boolean | null ?? null,
        bagType: grn.bagType as never, bags: grn.bags, smallBags: grn.smallBags, bigBags: grn.bigBags,
      });
      validateTransferBagConfirmation(input, bal.total, grn.grnNumber, isVerified);

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

      const storedRent = grn.rentAmount ?? 0;
      const effectiveObligation =
        storedRent > 0
          ? (storedRent > expectedRentCharge ? storedRent : expectedRentCharge)
          : expectedRentCharge;

      const totalPaid = (await rentRepository.findPaymentsByGrnId(facilityId, grn.id, session))
        .reduce((sum, p) => sum + p.amountPaid, 0);

      // D3: first-season hamali joins the transfer settlement like every other
      // obligation path (rent-gate, record-payment, rent summary). Zero for
      // non-hamali commodities and post-renewal seasons, so legacy flows are unchanged.
      const [transferCommodity, transferExtensions] = await Promise.all([
        CommodityModel.findOne({ id: grn.commodityId }, null, { session }).lean().exec(),
        rentExtensionRepository.findExtensionsByGrn(facilityId, grn.id, session),
      ]);
      const transferHamaliShare = computeFirstSeasonHamali(
        grn.bags,
        transferCommodity,
        transferExtensions,
        grn.hamaliRate,
        grn.hamaliAmount,
      );

      // The base is PROSPECTIVE, not historical: a transfer settles rent for
      // every remaining bag, and a Monthly lot has accrued rent for its elapsed
      // cycles. A different input to the obligation, not a competing rule - the
      // SSOT still governs extensions, outward charges and Hamali. Passing the
      // stored rentAmount would drop the accrual and skip the gate entirely.
      const totalDue = await rentExtensionRepository.resolveTotalDue(
        facilityId,
        {
          id: grn.id,
          rentAmount: effectiveObligation,
          rentType: grn.rentType,
          outwardRentCharges: await rentRepository.getOutwardRentChargesForGrn(
            facilityId,
            grn.id,
            session,
          ),
          hamaliShare: transferHamaliShare,
        },
        session,
      );
      const rentBal = computeRentBalance(totalDue, totalPaid);

      // 2. Strict settlement gate: Outstanding rent must be settled prior to ownership transfer
      const { paymentRecord, effectiveRentBal } = await settleTransferRent({
        facilityId,
        grnId: grn.id,
        grnNumber: grn.grnNumber,
        newCustomerName: newCustomer.name,
        movementDate,
        totalDue,
        totalPaid,
        rentBal,
        input,
        userId,
        session,
      });

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
            sourceBagCategory: (input as unknown as Record<string, unknown>).sourceBagCategory as never ?? null,
            sourceQuantity: (input as unknown as Record<string, unknown>).sourceQuantity as number | null ?? null,
            sourceBagPrice: (input as unknown as Record<string, unknown>).sourceBagPrice as number | null ?? null,
            sourceSeasonalBagPrice: (input as unknown as Record<string, unknown>).sourceSeasonalBagPrice as number | null ?? null,
            sourceMonthlyBagPrice: (input as unknown as Record<string, unknown>).sourceMonthlyBagPrice as number | null ?? null,
            financialSnapshot: {
              rentAmount: effectiveRentBal.rentAmount,
              totalPaid: effectiveRentBal.totalPaid,
              remainingBalance: effectiveRentBal.remainingBalance,
              paymentStatus: effectiveRentBal.paymentStatus,
              rentState: effectiveRentBal.rentState,
            },
            remarks: input.remarks.trim(),
            performedBy: userId,
            createdAt: new Date(),
          },
        ],
        { session, ordered: true },
      );

      resultMovementDoc = movementDocs[0].toObject();
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
      grnNumber: grnEntity.grnNumber,
      fromCustomer: movementRecord.fromCustomerName,
      toCustomer: movementRecord.toCustomerName,
      pendingRent: movementRecord.financialSnapshot.remainingBalance,
      paymentDecision: input.paymentDecision,
      receiptNumber: resultPayment?.receiptNumber ?? null,
      amountPaidAtTransfer: resultPayment?.amountPaid ?? 0,
      remarks: input.remarks,
    },
  });

  return { grn: grnEntity, movement: movementRecord, payment: resultPayment };
}
