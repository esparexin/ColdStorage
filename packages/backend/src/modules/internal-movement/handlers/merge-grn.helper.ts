import mongoose from 'mongoose';
import { randomUUID } from 'node:crypto';
import { GrnModel } from '../../../database/models/grn.model.js';
import { InventoryTransactionModel } from '../../../database/models/inventory-transaction.model.js';
import { RentPaymentModel } from '../../../database/models/rent-payment.model.js';
import { computeRentBalance, type RentBalance } from '../../common/rent-balance.js';
import { rentExtensionRepository } from '../../rent/rent-extension.repository.js';
import { calculateGrnMonthlyOccupancyRent } from '../../common/occupancy-rent.js';
import { counterService } from '../../common/counter.service.js';
import {
  canCalculateAuthoritativeRent,
  seasonYearForInwardDate,
  type BagType,
  type PaymentMode,
  type RentType,
} from '@cold-storage/contracts';
import type { LedgerBalance } from '../../inventory/ledger-balance.js';

export interface MergeSourceGrn {
  id: string;
  grnNumber: string;
  inwardReceiptNumber: string;
  date: Date;
  customerName: string;
  chamber: string;
  commodityId: string;
  bagType: BagType;
  rentType: RentType;
  rentAmount: number;
  bags: number;
  smallBags: number;
  bigBags: number;
  bagPrice?: number | null;
  smallBagPrice?: number | null;
  bigBagPrice?: number | null;
  remarks?: string | null;
}

export interface SourceRentResolution {
  effectiveRentAmount: number;
  totalPaid: number;
  sourceTotalDue: number;
  rentBal: RentBalance;
  isSameSeason: boolean;
  isPendingVerification: boolean;
  verificationReason?: string | null;
}

export interface ResolveSourceRentParams {
  facilityId: string;
  sourceGrn: MergeSourceGrn;
  targetGrnDate: Date;
  movementDate: Date;
  sourcePaymentAmount?: number | null;
  sourcePaymentMode?: PaymentMode | null;
  userId: string;
  session: mongoose.ClientSession;
}

export async function resolveSourceRentObligation(
  params: ResolveSourceRentParams,
): Promise<SourceRentResolution> {
  const {
    facilityId,
    sourceGrn,
    targetGrnDate,
    movementDate,
    sourcePaymentAmount,
    sourcePaymentMode,
    userId,
    session,
  } = params;

  const targetSeason = seasonYearForInwardDate(targetGrnDate);
  const sourceSeason = seasonYearForInwardDate(sourceGrn.date);
  const isSameSeason = sourceSeason === targetSeason;

  let effectiveRentAmount = sourceGrn.rentAmount ?? 0;
  if (sourceGrn.rentType === 'Monthly' && effectiveRentAmount === 0) {
    const occupancySummary = await calculateGrnMonthlyOccupancyRent(facilityId, sourceGrn.id, {
      asOfDate: movementDate,
    });
    if (occupancySummary && occupancySummary.totalOccupancyCharge > 0) {
      effectiveRentAmount = occupancySummary.totalOccupancyCharge;
      await GrnModel.updateOne(
        { id: sourceGrn.id },
        { $set: { rentAmount: effectiveRentAmount, updatedAt: new Date() } },
        { session },
      );
    }
  }

  const existingPayments = await RentPaymentModel.find(
    { facilityId, grnId: sourceGrn.id },
    null,
    { session },
  )
    .lean()
    .exec();

  let totalPaid = existingPayments.reduce((sum, p) => sum + p.amountPaid, 0);

  // If source inline payment was provided (Scenario B: Previous season merge settlement)
  if (sourcePaymentAmount != null && sourcePaymentAmount > 0) {
    const receiptNumber = await counterService.generateRentReceiptNumber(
      facilityId,
      movementDate,
      session,
    );
    await RentPaymentModel.create(
      [
        {
          id: `rent-pay-${randomUUID()}`,
          facilityId,
          grnId: sourceGrn.id,
          grnNumber: sourceGrn.grnNumber,
          receiptNumber,
          amountPaid: sourcePaymentAmount,
          paymentMode: sourcePaymentMode ?? 'Cash',
          paymentDate: movementDate,
          notes: `Pre-merge settlement: GRN ${sourceGrn.grnNumber}`,
          createdBy: userId,
          createdAt: new Date(),
        },
      ],
      { session, ordered: true },
    );
    totalPaid += sourcePaymentAmount;
  }

  // Bag composition verification guard:
  // If no existing billed rent and no payments exist, check if bag quantities are verified.
  // Never assume or fabricate an estimated historical bill when small/big counts are unverified.
  const canCalc = canCalculateAuthoritativeRent({
    bagType: sourceGrn.bagType,
    bags: sourceGrn.bags,
    smallBags: sourceGrn.smallBags,
    bigBags: sourceGrn.bigBags,
    bagPrice: sourceGrn.bagPrice,
    smallBagPrice: sourceGrn.smallBagPrice,
    bigBagPrice: sourceGrn.bigBagPrice,
  });

  const isPendingVerification =
    effectiveRentAmount === 0 && totalPaid === 0 && !canCalc.canCalculate;

  const sourceTotalDue = await rentExtensionRepository.resolveTotalDue(
    facilityId,
    { id: sourceGrn.id, rentAmount: effectiveRentAmount },
    session,
  );
  const rentBal = computeRentBalance(sourceTotalDue, totalPaid, { isPendingVerification });

  return {
    effectiveRentAmount,
    totalPaid,
    sourceTotalDue,
    rentBal,
    isSameSeason,
    isPendingVerification,
    verificationReason: isPendingVerification ? canCalc.reason : null,
  };
}

export interface CloseSourceGrnParams {
  facilityId: string;
  sourceGrn: MergeSourceGrn;
  targetGrnNumber: string;
  targetGrnId: string;
  movementId: string;
  movementDate: Date;
  ledgerBalance: LedgerBalance;
  rentResolution: SourceRentResolution;
  remarks: string;
  userId: string;
  session: mongoose.ClientSession;
}

export async function closeSourceGrnOnMerge(params: CloseSourceGrnParams): Promise<string> {
  const {
    facilityId,
    sourceGrn,
    targetGrnNumber,
    targetGrnId,
    movementId,
    movementDate,
    ledgerBalance,
    rentResolution,
    remarks,
    userId,
    session,
  } = params;

  await InventoryTransactionModel.create(
    [
      {
        id: `tx-${randomUUID()}`,
        facilityId,
        grnId: sourceGrn.id,
        grnNumber: sourceGrn.grnNumber,
        chamber: sourceGrn.chamber,
        commodityId: sourceGrn.commodityId,
        bagType: sourceGrn.bagType,
        transactionType: 'OUTWARD_DELIVERY',
        smallQuantity: ledgerBalance.smallBags,
        bigQuantity: ledgerBalance.bigBags,
        referenceType: 'DELIVERY',
        referenceId: `${movementId}-${sourceGrn.id}`,
        notes: `Merged into GRN ${targetGrnNumber}: ${remarks.trim()}`,
        createdBy: userId,
        createdAt: movementDate,
      },
    ],
    { session, ordered: true },
  );

  const moveDateStr = movementDate.toISOString().split('T')[0];
  const sourceNote = `[MERGED into GRN ${targetGrnNumber} on ${moveDateStr}: ${ledgerBalance.total} bags cleared. Financial record preserved: Rent Obligation ₹${rentResolution.effectiveRentAmount}, Paid ₹${rentResolution.totalPaid}, Pending ₹${rentResolution.rentBal.remainingBalance} (Status: ${rentResolution.rentBal.paymentStatus}). Customer: ${sourceGrn.customerName}. Reason: ${remarks.trim()}]`;
  const updatedSourceRemarks = sourceGrn.remarks ? `${sourceGrn.remarks}\n${sourceNote}` : sourceNote;

  await GrnModel.updateOne(
    { id: sourceGrn.id },
    {
      $set: {
        status: 'CLOSED',
        remarks: updatedSourceRemarks,
        mergedIntoGrnId: targetGrnId,
        mergedIntoGrnNumber: targetGrnNumber,
        updatedAt: new Date(),
      },
    },
    { session },
  );

  const inwardDateStr = new Date(sourceGrn.date).toISOString().split('T')[0];
  return `GRN ${sourceGrn.grnNumber} (Receipt #${sourceGrn.inwardReceiptNumber}, Date: ${inwardDateStr}, Customer: ${sourceGrn.customerName}, Bags: ${ledgerBalance.total}, Rent: ₹${rentResolution.effectiveRentAmount}, Paid: ₹${rentResolution.totalPaid}, Balance: ₹${rentResolution.rentBal.remainingBalance}, Status: ${rentResolution.rentBal.paymentStatus})`;
}
