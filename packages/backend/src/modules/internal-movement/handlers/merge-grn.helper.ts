import mongoose from 'mongoose';
import { randomUUID } from 'node:crypto';
import { GrnModel } from '../../../database/models/grn.model.js';
import { InventoryTransactionModel } from '../../../database/models/inventory-transaction.model.js';
import { RentPaymentModel } from '../../../database/models/rent-payment.model.js';
import { computeRentBalance, type RentBalance } from '../../common/rent-balance.js';
import { rentExtensionRepository } from '../../rent/rent-extension.repository.js';
import { calculateGrnMonthlyOccupancyRent } from '../../common/occupancy-rent.js';
import type { BagType, RentType } from '@cold-storage/contracts';
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
  remarks?: string | null;
}

export interface SourceRentResolution {
  effectiveRentAmount: number;
  totalPaid: number;
  sourceTotalDue: number;
  rentBal: RentBalance;
}

export async function resolveSourceRentObligation(
  facilityId: string,
  sourceGrn: MergeSourceGrn,
  movementDate: Date,
  session: mongoose.ClientSession,
): Promise<SourceRentResolution> {
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

  const payments = await RentPaymentModel.find({ facilityId, grnId: sourceGrn.id }, null, { session })
    .lean()
    .exec();
  const totalPaid = payments.reduce((sum, p) => sum + p.amountPaid, 0);
  const sourceTotalDue = await rentExtensionRepository.resolveTotalDue(
    facilityId,
    { id: sourceGrn.id, rentAmount: effectiveRentAmount },
    session,
  );
  const rentBal = computeRentBalance(sourceTotalDue, totalPaid);

  return { effectiveRentAmount, totalPaid, sourceTotalDue, rentBal };
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
        referenceId: movementId,
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
