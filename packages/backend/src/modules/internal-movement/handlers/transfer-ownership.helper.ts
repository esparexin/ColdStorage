import mongoose from 'mongoose';
import { randomUUID } from 'node:crypto';
import { calculateHamaliAmount, type TransferOwnershipInput, type RentPayment, type InternalMovementRecord } from '@cold-storage/contracts';
import { InventoryTransactionModel } from '../../../database/models/inventory-transaction.model.js';
import { InternalMovementModel } from '../../../database/models/internal-movement.model.js';
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

export async function alignTransferLedger(params: {
  facilityId: string;
  grn: { id: string; grnNumber: string; chamber: string; commodityId: string; bagType: string };
  movementId: string;
  movementDate: Date;
  userId: string;
  bal: { smallBags: number; bigBags: number; total: number };
  confSmall: number;
  confBig: number;
  resultingBagType: string;
  destinationChamber?: string;
  session: mongoose.ClientSession;
}): Promise<void> {
  const { facilityId, grn, movementId, movementDate, userId, bal, confSmall, confBig, resultingBagType, destinationChamber, session } = params;
  const targetChamber = destinationChamber || grn.chamber;

  await InventoryTransactionModel.create(
    [
      {
        id: `tx-out-${randomUUID()}`, facilityId, grnId: grn.id, grnNumber: grn.grnNumber,
        chamber: grn.chamber, commodityId: grn.commodityId, bagType: grn.bagType,
        transactionType: 'OUTWARD_DELIVERY', smallQuantity: bal.smallBags, bigQuantity: bal.bigBags,
        referenceType: 'DELIVERY', referenceId: movementId,
        notes: `Stock adjustment for ownership transfer (Lot ${grn.grnNumber})`,
        createdBy: userId, createdAt: movementDate,
      },
      {
        id: `tx-in-${randomUUID()}`, facilityId, grnId: grn.id, grnNumber: grn.grnNumber,
        chamber: targetChamber, commodityId: grn.commodityId, bagType: resultingBagType,
        transactionType: 'INWARD_PUTAWAY', smallQuantity: confSmall, bigQuantity: confBig,
        referenceType: 'PUT_AWAY', referenceId: movementId,
        notes: `Confirmed stock putaway for ownership transfer (Lot ${grn.grnNumber})`,
        createdBy: userId, createdAt: movementDate,
      },
    ],
    { session, ordered: true },
  );
}

export interface CreateTransferMovementParams {
  movementId: string; facilityId: string; input: TransferOwnershipInput;
  grn: { id: string; grnNumber: string; customerId: string; customerName: string };
  newCustomer: { id: string; name: string };
  bal: { total: number }; finalSmall: number; finalBig: number;
  finalChamber: string; resultingBagType: string; isRepackedHybrid: boolean;
  transferCommodity?: { isHamaliApplicable?: boolean; hamaliRate?: number } | null;
  effectiveRentBal: RentBalance; userId: string; session: mongoose.ClientSession;
}

export async function createTransferMovement(
  params: CreateTransferMovementParams,
): Promise<InternalMovementRecord> {
  const {
    movementId, facilityId, input, grn, newCustomer, bal,
    finalSmall, finalBig, finalChamber, resultingBagType,
    isRepackedHybrid, transferCommodity, effectiveRentBal,
    userId, session,
  } = params;

  const isExplicitRepack =
    typeof input.repackedSmallBags === 'number' ||
    typeof input.repackedBigBags === 'number' ||
    typeof input.repackedQuantity === 'number';
  const isHamaliApp =
    transferCommodity?.isHamaliApplicable ?? ((transferCommodity?.hamaliRate ?? 0) > 0);
  const repackHamaliRate = isHamaliApp ? (transferCommodity?.hamaliRate ?? 0) : 0;
  const repackedCount = isRepackedHybrid
    ? (input.repackedQuantity ?? (finalSmall + finalBig))
    : (finalSmall + finalBig);
  const repackHamaliCharge =
    isExplicitRepack && repackHamaliRate > 0 ? calculateHamaliAmount(repackedCount, repackHamaliRate) : 0;

  const docs = await InternalMovementModel.create(
    [
      {
        id: movementId, facilityId, movementType: 'TRANSFER_OWNERSHIP',
        movementDate: input.movementDate, grnId: grn.id, grnNumber: grn.grnNumber,
        fromCustomerId: grn.customerId, fromCustomerName: grn.customerName,
        toCustomerId: newCustomer.id, toCustomerName: newCustomer.name,
        totalBagsMoved: bal.total, smallBagsMoved: finalSmall, bigBagsMoved: finalBig,
        destinationChamber: finalChamber, resultingBagType,
        hamaliBags: isExplicitRepack ? repackedCount : undefined,
        hamaliRate: isExplicitRepack ? repackHamaliRate : undefined,
        hamaliCharge: isExplicitRepack ? repackHamaliCharge : undefined,
        referenceWeight: input.referenceWeight ?? null,
        sourceBagType: input.sourceBagType ?? resultingBagType,
        sourceBagCategory: input.sourceBagCategory ?? resultingBagType,
        sourceQuantity: input.sourceQuantity ?? null,
        sourceBagPrice: input.sourceBagPrice ?? null,
        sourceSeasonalBagPrice: input.sourceSeasonalBagPrice ?? null,
        sourceMonthlyBagPrice: input.sourceMonthlyBagPrice ?? null,
        financialSnapshot: {
          rentAmount: effectiveRentBal.rentAmount,
          totalPaid: effectiveRentBal.totalPaid,
          remainingBalance: effectiveRentBal.remainingBalance,
          paymentStatus: effectiveRentBal.paymentStatus,
          rentState: effectiveRentBal.rentState,
          hamaliAmount: repackHamaliCharge,
        },
        remarks: input.remarks.trim(), performedBy: userId, createdAt: new Date(),
      },
    ],
    { session, ordered: true },
  );

  return docs[0].toObject() as InternalMovementRecord;
}
