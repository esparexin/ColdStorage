import mongoose from 'mongoose';
import { randomUUID } from 'node:crypto';
import type { TransferOwnershipInput, RentPayment } from '@cold-storage/contracts';
import { computeRentBalance, type RentBalance } from '../../common/rent-balance.js';
import { counterService } from '../../common/counter.service.js';
import { rentRepository } from '../../rent/rent.repository.js';
import { toPaymentEntity } from '../../rent/handlers/record-payment.handler.js';

export interface SettleTransferRentParams {
  facilityId: string;
  grnId: string;
  grnNumber: string;
  sourceCustomerId: string;
  sourceCustomerName: string;
  newCustomerName: string;
  movementDate: Date;
  totalDue: number;
  totalPaid: number;
  rentBal: RentBalance;
  input: TransferOwnershipInput;
  userId: string;
  session: mongoose.ClientSession;
}

export async function settleTransferRent(params: SettleTransferRentParams): Promise<{
  paymentRecord: RentPayment | undefined;
  effectiveRentBal: RentBalance;
}> {
  const {
    facilityId,
    grnId,
    grnNumber,
    sourceCustomerId,
    sourceCustomerName,
    newCustomerName,
    movementDate,
    totalDue,
    totalPaid,
    rentBal,
    input,
    userId,
    session,
  } = params;

  let effectiveRentBal = rentBal;
  let paymentRecord: RentPayment | undefined;

  if (rentBal.remainingBalance > 0) {
    if (input.paymentDecision === 'AGREED_PENDING') {
      return {
        paymentRecord: undefined,
        effectiveRentBal: rentBal,
      };
    }

    if (
      input.paymentDecision !== 'SETTLE_NOW' ||
      !input.settlementDetails ||
      input.settlementDetails.amountPaid < rentBal.remainingBalance
    ) {
      throw new Error(
        `Cannot transfer ownership: Outstanding rent of ₹${rentBal.remainingBalance.toLocaleString('en-IN')} must be fully settled before transfer under SETTLE_NOW, or choose AGREED_PENDING to carry forward.`,
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
        grnId,
        grnNumber,
        customerId: sourceCustomerId,
        customerName: sourceCustomerName,
        receiptNumber,
        amountPaid,
        paymentMode,
        paymentDate: movementDate,
        notes: paymentNotes?.trim() || `Settled upon ownership transfer to ${newCustomerName}`,
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

  return { paymentRecord, effectiveRentBal };
}

export function formatTransferAuditNote(params: {
  transferDateStr: string;
  fromName: string;
  fromId: string;
  toName: string;
  toId: string;
  paymentRecord?: RentPayment;
  effectiveRentBal: RentBalance;
  remarks: string;
}): string {
  const { transferDateStr, fromName, fromId, toName, toId, paymentRecord, effectiveRentBal, remarks } = params;
  const prefix = `[OWNERSHIP TRANSFERRED on ${transferDateStr}: from ${fromName} (ID: ${fromId}) to ${toName} (ID: ${toId}).`;
  if (paymentRecord) {
    return `${prefix} Settled at transfer: ₹${paymentRecord.amountPaid} (Receipt #${paymentRecord.receiptNumber}). Rent obligation: ₹${effectiveRentBal.rentAmount} (Status: Settled). Reason: ${remarks.trim()}]`;
  }
  if (effectiveRentBal.remainingBalance > 0) {
    return `${prefix} Pending rent obligation: ₹${effectiveRentBal.remainingBalance} carried forward under agreed pending terms. Rent obligation: ₹${effectiveRentBal.rentAmount} (Prior collected: ₹${effectiveRentBal.totalPaid}). Reason: ${remarks.trim()}]`;
  }
  return `${prefix} Rent obligation: ₹${effectiveRentBal.rentAmount} previously settled (Prior collected: ₹${effectiveRentBal.totalPaid}). Reason: ${remarks.trim()}]`;
}
