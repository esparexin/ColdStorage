import mongoose from 'mongoose';
import { randomUUID } from 'node:crypto';
import { GrnModel } from '../../../database/models/grn.model.js';
import { InventoryTransactionModel } from '../../../database/models/inventory-transaction.model.js';
import { rentRepository } from '../../rent/rent.repository.js';
import { resolveMovementObligation } from './resolve-movement-obligation.js';
import { computeRentBalance, type RentBalance } from '../../common/rent-balance.js';
import { calculateGrnMonthlyOccupancyRent } from '../../common/occupancy-rent.js';
import { counterService } from '../../common/counter.service.js';
import {
  canCalculateAuthoritativeRent,
  resolveStoredCompositionVerified,
  seasonYearForInwardDate,
  toExcludedPeriodKeys,
  type BagType,
  type PaymentMode,
  type RentType,
} from '@cold-storage/contracts';
import type { LedgerBalance } from '../../inventory/ledger-balance.js';
import { computeExpectedDeliveryRent } from '../../delivery/handlers/delivery-rent.helper.js';

import { CommodityModel } from '../../../database/models/commodity.model.js';
import { computeFirstSeasonHamali } from '../../common/hamali-resolution.js';
import { rentExtensionRepository } from '../../rent/rent-extension.repository.js';

export interface MergeSourceGrn {
  id: string; grnNumber: string; inwardReceiptNumber: string; date: Date; customerName: string;
  chamber: string; commodityId: string; bagType: BagType; rentType: RentType; rentAmount: number;
  bags: number; smallBags: number; bigBags: number; bagPrice?: number | null;
  smallBagPrice?: number | null; bigBagPrice?: number | null; remarks?: string | null;
  hamaliRate?: number | null; hamaliAmount?: number | null;
  isCompositionVerified?: boolean | null; status?: string; loanStatus?: string | null;
}

export interface SourceRentResolution {
  effectiveRentAmount: number; totalPaid: number; sourceTotalDue: number; rentBal: RentBalance;
  isSameSeason: boolean; isPendingVerification: boolean; verificationReason?: string | null;
}

export interface ResolveSourceRentParams {
  facilityId: string; sourceGrn: MergeSourceGrn; targetGrnDate: Date; movementDate: Date;
  sourcePaymentAmount?: number | null; sourcePaymentMode?: PaymentMode | null;
  userId: string; session: mongoose.ClientSession;
}

export async function resolveSourceRentObligation(
  params: ResolveSourceRentParams,
): Promise<SourceRentResolution> {
  const {
    facilityId, sourceGrn, targetGrnDate, movementDate,
    sourcePaymentAmount, sourcePaymentMode, userId, session,
  } = params;

  const targetSeason = seasonYearForInwardDate(targetGrnDate);
  const sourceSeason = seasonYearForInwardDate(sourceGrn.date);
  const isSameSeason = sourceSeason === targetSeason;

  let effectiveRentAmount = sourceGrn.rentAmount ?? 0;
  const [commodity, extensions] = await Promise.all([
    CommodityModel.findOne({ id: sourceGrn.commodityId }, null, { session }).lean().exec(),
    rentExtensionRepository.findExtensionsByGrn(facilityId, sourceGrn.id, session),
  ]);
  const excludedKeys = toExcludedPeriodKeys(extensions);
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
  } else if (sourceGrn.rentType === 'Seasonal' || sourceGrn.rentType === 'Seasonal_3M') {
    // Never bill an unverified placeholder split at differential rates.
    const diffSmall = sourceGrn.smallBagPrice ?? sourceGrn.bagPrice ?? 0;
    const diffBig = sourceGrn.bigBagPrice ?? sourceGrn.bagPrice ?? 0;
    const unverifiedDifferential =
      (sourceGrn.smallBagPrice != null || sourceGrn.bigBagPrice != null) &&
      diffSmall !== diffBig &&
      sourceGrn.bagType !== 'S' && sourceGrn.bagType !== 'B' &&
      !resolveStoredCompositionVerified({
        isCompositionVerified: sourceGrn.isCompositionVerified ?? null, bagType: sourceGrn.bagType,
        bags: sourceGrn.bags, smallBags: sourceGrn.smallBags, bigBags: sourceGrn.bigBags,
      });
    if (!unverifiedDifferential) {
      const effectiveSmall = sourceGrn.smallBags > 0 ? sourceGrn.smallBags : sourceGrn.bagType === 'S' ? sourceGrn.bags : 0;
      const effectiveBig = sourceGrn.bigBags > 0 ? sourceGrn.bigBags : (sourceGrn.bagType === 'B' || sourceGrn.bagType === 'S/B' || sourceGrn.bagType === 'S+B') ? sourceGrn.bags - effectiveSmall : 0;

      const { expectedRentCharge } = await computeExpectedDeliveryRent({
        grn: {
          id: sourceGrn.id, grnNumber: sourceGrn.grnNumber, date: sourceGrn.date, rentType: sourceGrn.rentType, commodityId: sourceGrn.commodityId,
          smallBagPrice: sourceGrn.smallBagPrice, bigBagPrice: sourceGrn.bigBagPrice, bagPrice: sourceGrn.bagPrice,
        },
        withdrawal: { smallBags: effectiveSmall, bigBags: effectiveBig },
        deliveryDate: movementDate, session, excludePeriodKeys: excludedKeys,
      });

      if (expectedRentCharge > effectiveRentAmount) {
        effectiveRentAmount = expectedRentCharge;
        await GrnModel.updateOne(
          { id: sourceGrn.id },
          { $set: { rentAmount: effectiveRentAmount, updatedAt: new Date() } },
          { session },
        );
      }
    }
  }

  const existingPayments = await rentRepository.findPaymentsByGrnId(
    facilityId,
    sourceGrn.id,
    session,
  );

  let totalPaid = existingPayments.reduce((sum, p) => sum + p.amountPaid, 0);

  // Bag composition verification guard:
  // If no existing billed rent and no payments exist, check if bag quantities are verified.
  // Never assume or fabricate an estimated historical bill when small/big counts are unverified.
  const canCalc = canCalculateAuthoritativeRent({
    bagType: sourceGrn.bagType, bags: sourceGrn.bags, smallBags: sourceGrn.smallBags, bigBags: sourceGrn.bigBags,
    bagPrice: sourceGrn.bagPrice, smallBagPrice: sourceGrn.smallBagPrice, bigBagPrice: sourceGrn.bigBagPrice,
  });

  const sourceHamaliShare =
    effectiveRentAmount > 0
      ? computeFirstSeasonHamali(
          sourceGrn.bags,
          commodity,
          extensions,
          sourceGrn.hamaliRate,
          sourceGrn.hamaliAmount,
        )
      : 0;

  const isCompositionUnverified = effectiveRentAmount === 0 && totalPaid === 0 && !canCalc.canCalculate;
  const isLegacyUnverifiedHamali =
    sourceGrn.hamaliRate == null && sourceGrn.hamaliAmount == null && sourceHamaliShare > 0 && totalPaid === 0;
  const isPendingVerification = isCompositionUnverified || isLegacyUnverifiedHamali;

  const sourceTotalDue = await resolveMovementObligation(
    facilityId,
    {
      id: sourceGrn.id,
      rentAmount: effectiveRentAmount,
      rentType: sourceGrn.rentType,
      hamaliShare: sourceHamaliShare,
    },
    session,
  );

  const remainingSourceBalance = Math.max(0, Number((sourceTotalDue - totalPaid).toFixed(2)));

  // If source inline payment was provided (Scenario B: Previous season merge settlement)
  if (sourcePaymentAmount != null && sourcePaymentAmount > 0) {
    if (sourcePaymentAmount > remainingSourceBalance) {
      throw new Error(
        `Requested payment ₹${sourcePaymentAmount} exceeds remaining rent balance of ₹${remainingSourceBalance} for source GRN '${sourceGrn.grnNumber}'`,
      );
    }
    const receiptNumber = await counterService.generateRentReceiptNumber(facilityId, movementDate, session);
    await rentRepository.createPayment({
      id: `rent-pay-${randomUUID()}`, facilityId, grnId: sourceGrn.id, grnNumber: sourceGrn.grnNumber,
      receiptNumber, amountPaid: sourcePaymentAmount, paymentMode: (sourcePaymentMode ?? 'Cash') as 'Cash' | 'UPI',
      paymentDate: movementDate, notes: `Pre-merge settlement: GRN ${sourceGrn.grnNumber}`, createdBy: userId,
    }, session);
    totalPaid += sourcePaymentAmount;
  }

  const rentBal = computeRentBalance(sourceTotalDue, totalPaid, { isPendingVerification });

  const verificationReason = isPendingVerification
    ? !canCalc.canCalculate
      ? canCalc.reason
      : 'Legacy GRN has no stored Hamali rate snapshot; historical rate requires verification'
    : null;

  return {
    effectiveRentAmount,
    totalPaid,
    sourceTotalDue,
    rentBal,
    isSameSeason,
    isPendingVerification,
    verificationReason,
  };
}

export interface CloseSourceGrnParams {
  facilityId: string; sourceGrn: MergeSourceGrn; targetGrnNumber: string; targetGrnId: string;
  movementId: string; movementDate: Date; ledgerBalance: LedgerBalance;
  rentResolution: SourceRentResolution; remarks: string; userId: string;
  session: mongoose.ClientSession;
}

export async function closeSourceGrnOnMerge(params: CloseSourceGrnParams): Promise<string> {
  const {
    facilityId, sourceGrn, targetGrnNumber, targetGrnId,
    movementId, movementDate, ledgerBalance, rentResolution,
    remarks, userId, session,
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
