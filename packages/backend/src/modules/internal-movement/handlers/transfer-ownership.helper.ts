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
        grnId,
        grnNumber,
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
