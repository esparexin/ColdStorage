import mongoose from 'mongoose';
import { randomUUID } from 'node:crypto';
import {
  calculateHamaliAmount,
  isHybridBagCategory,
  type TransferOwnershipInput,
  type RentPayment,
  type InternalMovementRecord,
} from '@cold-storage/contracts';
import { InventoryTransactionModel } from '../../../database/models/inventory-transaction.model.js';
import { InternalMovementModel } from '../../../database/models/internal-movement.model.js';
import type { RentBalance } from '../../common/rent-balance.js';
export {
  calculateTransferDues,
  type CalculateTransferDuesParams,
  settleTransferRent,
  type SettleTransferRentParams,
} from './transfer-ownership.rent.js';

export function formatTransferAuditNote(params: {
  transferDateStr: string;
  fromName: string;
  fromId: string;
  toName: string;
  toId: string;
  totalBags: number;
  smallBags: number;
  bigBags: number;
  bagType: string;
  transferInvoiceNumber?: string | null;
  transferFeeCharged?: number;
  feePayer?: 'BUYER' | 'SELLER' | null;
  paymentRecord?: RentPayment;
  effectiveRentBal: RentBalance;
  remarks: string;
}): string {
  const {
    transferDateStr, fromName, fromId, toName, toId,
    totalBags, smallBags, bigBags, bagType,
    transferInvoiceNumber, transferFeeCharged, feePayer,
    paymentRecord, effectiveRentBal, remarks,
  } = params;
  const isHybrid = bagType === 'Hybrid' || isHybridBagCategory(bagType);
  const compositionDetail = isHybrid
    ? `+${totalBags} bags (Hybrid)`
    : `+${totalBags} bags (S: ${smallBags} • B: ${bigBags}, BagType: ${bagType})`;
  const invoiceDetail = transferInvoiceNumber ? ` Invoice: #${transferInvoiceNumber}` : '';
  const feeDetail =
    typeof transferFeeCharged === 'number' && transferFeeCharged > 0
      ? ` Transfer Fee: ₹${transferFeeCharged}${feePayer ? ` (Paid by ${feePayer})` : ''}`
      : '';
  const prefix = `[OWNERSHIP TRANSFERRED on ${transferDateStr}: ${compositionDetail}${invoiceDetail}${feeDetail} from ${fromName} (ID: ${fromId}) to ${toName} (ID: ${toId}).`;
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
  transferInvoiceNumber?: string | null;
  transferFeeCharged?: number;
  feePayer?: 'BUYER' | 'SELLER' | null;
  effectiveRentBal: RentBalance; userId: string; session: mongoose.ClientSession;
}

export async function createTransferMovement(
  params: CreateTransferMovementParams,
): Promise<InternalMovementRecord> {
  const {
    movementId, facilityId, input, grn, newCustomer, bal,
    finalSmall, finalBig, finalChamber, resultingBagType,
    isRepackedHybrid, transferCommodity, transferInvoiceNumber,
    transferFeeCharged, feePayer, effectiveRentBal,
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
        transferInvoiceNumber: transferInvoiceNumber ?? null,
        transferFeeCharged: transferFeeCharged ?? 0,
        feePayer: feePayer ?? null,
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

export function buildTransferGrnUpdateFields(params: {
  newCustomer: { id: string; name: string };
  finalChamber: string;
  resultingBagType: string;
  finalBags: number;
  finalSmall: number;
  finalBig: number;
  updatedRemarks: string;
  referenceWeight?: number | null;
  effectiveObligation: number;
  isHybrid: boolean;
  input: TransferOwnershipInput;
  previousRentAmount?: number | null;
}): Record<string, unknown> {
  const {
    newCustomer, finalChamber, resultingBagType, finalBags,
    finalSmall, finalBig, updatedRemarks, referenceWeight,
    effectiveObligation, isHybrid, input, previousRentAmount,
  } = params;

  const updateFields: Record<string, unknown> = {
    customerId: newCustomer.id,
    customerName: newCustomer.name,
    chamber: finalChamber,
    bagType: resultingBagType,
    bags: finalBags,
    smallBags: finalSmall,
    bigBags: finalBig,
    isCompositionVerified: true,
    remarks: updatedRemarks,
    updatedAt: new Date(),
  };
  if (referenceWeight !== undefined && referenceWeight !== null) {
    updateFields.totalBagsWeight = referenceWeight;
  }
  if (input.partyMark !== undefined) {
    updateFields.partyMark = input.partyMark?.trim() || null;
  }
  if (effectiveObligation > 0 && (previousRentAmount ?? 0) > 0) updateFields.rentAmount = effectiveObligation;
  if (isHybrid) {
    if (typeof input.sourceBagPrice === 'number' && input.sourceBagPrice > 0) updateFields.bagPrice = input.sourceBagPrice;
    if (typeof input.sourceSeasonalBagPrice === 'number' && input.sourceSeasonalBagPrice > 0) updateFields.smallBagPrice = input.sourceSeasonalBagPrice;
    if (typeof input.sourceMonthlyBagPrice === 'number' && input.sourceMonthlyBagPrice > 0) updateFields.bigBagPrice = input.sourceMonthlyBagPrice;
  }
  return updateFields;
}
