import mongoose from 'mongoose';
import { randomUUID } from 'node:crypto';
import { GrnModel } from '../../../database/models/grn.model.js';
import { rentRepository } from '../../rent/rent.repository.js';
import { resolveMovementObligation } from './resolve-movement-obligation.js';
import { computeRentBalance, type RentBalance } from '../../common/rent-balance.js';
import { calculateGrnMonthlyOccupancyRent } from '../../common/occupancy-rent.js';
import { counterService } from '../../common/counter.service.js';
import {
  canCalculateAuthoritativeRent, isHybridBagCategory, resolveEffectiveGrnRentType, resolveMergeExcludedPeriodKeys,
  resolveStoredCompositionVerified, seasonYearForInwardDate, toExcludedPeriodKeys,
  type BagType, type PaymentMode, type RentType,
} from '@cold-storage/contracts';
import { computeExpectedDeliveryRent } from '../../delivery/handlers/delivery-rent.helper.js';
import { CommodityModel } from '../../../database/models/commodity.model.js';
import { computeFirstSeasonHamali } from '../../common/hamali-resolution.js';
import { rentExtensionRepository } from '../../rent/rent-extension.repository.js';

export interface MergeSourceGrn {
  id: string; grnNumber: string; inwardReceiptNumber: string; date: Date; customerId?: string; customerName: string;
  chamber: string; commodityId: string; bagType: BagType; rentType: RentType; rentAmount: number;
  bags: number; closingBags?: number | null; smallBags: number; bigBags: number; bagPrice?: number | null;
  smallBagPrice?: number | null; bigBagPrice?: number | null; remarks?: string | null;
  hamaliRate?: number | null; hamaliAmount?: number | null;
  isCompositionVerified?: boolean | null; status?: string; loanStatus?: string | null;
}

export interface SourceRentResolution {
  effectiveRentAmount: number; totalPaid: number; sourceTotalDue: number; rentBal: RentBalance;
  isSameSeason: boolean; isPendingVerification: boolean; verificationReason?: string | null;
  paidAmount: number;
}

export interface ResolveSourceRentParams {
  facilityId: string; sourceGrn: MergeSourceGrn; targetGrnDate: Date; movementDate: Date; targetGrnNumber?: string;
  sourcePaymentAmount?: number | null; sourcePaymentMode?: PaymentMode | null; userId: string; session: mongoose.ClientSession;
  sourceBagType?: BagType | null; sourceBagCategory?: string | null; sourceQuantity?: number | null;
  sourceBagPrice?: number | null; sourceSeasonalBagPrice?: number | null; sourceMonthlyBagPrice?: number | null;
  confirmedSmallBags?: number | null; confirmedBigBags?: number | null; isSingleSource?: boolean;
}

export async function resolveSourceRentObligation(
  params: ResolveSourceRentParams,
): Promise<SourceRentResolution> {
  const { facilityId, sourceGrn, targetGrnDate, movementDate, sourcePaymentAmount, sourcePaymentMode, userId, session } = params;

  const targetSeason = seasonYearForInwardDate(targetGrnDate);
  const sourceSeason = seasonYearForInwardDate(sourceGrn.date);
  const isSameSeason = sourceSeason === targetSeason;
  const isHybrid = params.sourceBagType === 'Hybrid' || isHybridBagCategory(params.sourceBagCategory);

  let effectiveRentAmount = sourceGrn.rentAmount ?? 0;
  const [commodity, extensions] = await Promise.all([
    CommodityModel.findOne({ id: sourceGrn.commodityId }, null, { session }).lean().exec(),
    rentExtensionRepository.findExtensionsByGrn(facilityId, sourceGrn.id, session),
  ]);
  const excludedKeys = Array.from(new Set([...toExcludedPeriodKeys(extensions), ...resolveMergeExcludedPeriodKeys({
    inwardDate: sourceGrn.date, movementDate, targetGrnDate, billedExtensionKeys: toExcludedPeriodKeys(extensions),
  })]));
  const effectiveSourceRentType = resolveEffectiveGrnRentType({
    rentType: sourceGrn.rentType, inwardDate: sourceGrn.date, asOfDate: movementDate,
  });
  if (effectiveSourceRentType === 'Monthly' && effectiveRentAmount === 0 && !isHybrid) {
    const occupancySummary = await calculateGrnMonthlyOccupancyRent(facilityId, sourceGrn.id, { asOfDate: movementDate });
    if (occupancySummary && occupancySummary.totalOccupancyCharge > 0) {
      effectiveRentAmount = occupancySummary.totalOccupancyCharge;
      await GrnModel.updateOne({ id: sourceGrn.id }, { $set: { rentAmount: effectiveRentAmount, updatedAt: new Date() } }, { session });
    }
  } else if (effectiveSourceRentType === 'Seasonal' || effectiveSourceRentType === 'Seasonal_3M' || isHybrid) {
    // Never bill an unverified placeholder split at differential rates.
    const diffSmall = sourceGrn.smallBagPrice ?? sourceGrn.bagPrice ?? 0;
    const diffBig = sourceGrn.bigBagPrice ?? sourceGrn.bagPrice ?? 0;
    const isSourceVerified = resolveStoredCompositionVerified({
      isCompositionVerified: sourceGrn.isCompositionVerified ?? null, bagType: sourceGrn.bagType,
      bags: sourceGrn.bags, smallBags: sourceGrn.smallBags, bigBags: sourceGrn.bigBags,
    });
    const unverifiedDifferential = !isHybrid && (sourceGrn.smallBagPrice != null || sourceGrn.bigBagPrice != null) &&
      diffSmall !== diffBig && sourceGrn.bagType !== 'S' && sourceGrn.bagType !== 'B' && !isSourceVerified;
    const hasConfirmedCounts = !isSourceVerified && params.confirmedSmallBags != null && params.confirmedBigBags != null;
    if (!unverifiedDifferential || hasConfirmedCounts) {
      const effectiveSmall = hasConfirmedCounts ? (params.confirmedSmallBags as number)
        : (sourceGrn.smallBags > 0 ? sourceGrn.smallBags : sourceGrn.bagType === 'S' ? sourceGrn.bags : 0);
      const effectiveBig = hasConfirmedCounts ? (params.confirmedBigBags as number)
        : (sourceGrn.bigBags > 0 ? sourceGrn.bigBags : (sourceGrn.bagType === 'B' || sourceGrn.bagType === 'S/B' || sourceGrn.bagType === 'S+B') ? sourceGrn.bags - effectiveSmall : 0);

      const { expectedRentCharge } = await computeExpectedDeliveryRent({
        grn: {
          id: sourceGrn.id, grnNumber: sourceGrn.grnNumber, date: sourceGrn.date, rentType: sourceGrn.rentType, commodityId: sourceGrn.commodityId,
          smallBagPrice: sourceGrn.smallBagPrice, bigBagPrice: sourceGrn.bigBagPrice, bagPrice: sourceGrn.bagPrice,
        },
        withdrawal: { smallBags: effectiveSmall, bigBags: effectiveBig },
        quantity: isHybrid ? (params.sourceQuantity ?? sourceGrn.bags) : undefined,
        deliveryDate: movementDate, session, excludePeriodKeys: excludedKeys,
        bagCategory: params.sourceBagCategory, bagPrice: params.sourceBagPrice,
        seasonalBagPrice: params.sourceSeasonalBagPrice, monthlyBagPrice: params.sourceMonthlyBagPrice,
        isRatesInclusiveOfHamali: false,
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

  const sourceHamaliShare = computeFirstSeasonHamali(
    sourceGrn.bags, commodity, extensions, sourceGrn.hamaliRate, sourceGrn.hamaliAmount,
  );

  const existingPayments = await rentRepository.findPaymentsByGrnId(facilityId, sourceGrn.id, session);
  let totalPaid = existingPayments.reduce((sum, p) => sum + p.amountPaid, 0);
  const totalObligationBeforePayments = effectiveRentAmount + sourceHamaliShare;
  if (totalPaid > totalObligationBeforePayments) {
    effectiveRentAmount = Math.max(0, totalPaid - sourceHamaliShare);
    await GrnModel.updateOne(
      { id: sourceGrn.id },
      { $set: { rentAmount: effectiveRentAmount, updatedAt: new Date() } },
      { session },
    );
  }

  // Bag composition verification guard:
  // If no existing billed rent and no payments exist, check if bag quantities are verified.
  // Never assume or fabricate an estimated historical bill when small/big counts are unverified.
  const canCalc = canCalculateAuthoritativeRent({
    bagType: sourceGrn.bagType, bags: sourceGrn.bags, smallBags: sourceGrn.smallBags, bigBags: sourceGrn.bigBags,
    bagPrice: sourceGrn.bagPrice, smallBagPrice: sourceGrn.smallBagPrice, bigBagPrice: sourceGrn.bigBagPrice,
  });

  const isCompositionUnverified = effectiveRentAmount === 0 && totalPaid === 0 && !canCalc.canCalculate;
  const isLegacyUnverifiedHamali =
    sourceGrn.hamaliRate == null && sourceGrn.hamaliAmount == null && sourceHamaliShare > 0 && totalPaid === 0;
  const isPendingVerification = isCompositionUnverified || isLegacyUnverifiedHamali;

  const sourceTotalDue = await resolveMovementObligation(
    facilityId,
    {
      id: sourceGrn.id, rentAmount: effectiveRentAmount, rentType: effectiveSourceRentType,
      hamaliShare: sourceHamaliShare, remainingBags: sourceGrn.closingBags ?? sourceGrn.bags, totalBags: sourceGrn.bags,
    },
    session,
  );

  const remainingSourceBalance = Math.max(0, Number((sourceTotalDue - totalPaid).toFixed(2)));

  let paidAmount = 0;
  // If source inline payment was provided (Scenario B: Previous season merge settlement)
  if (sourcePaymentAmount != null && sourcePaymentAmount > 0) {
    if (params.isSingleSource && sourcePaymentAmount > remainingSourceBalance) {
      throw new Error(
        `Requested payment ₹${sourcePaymentAmount} exceeds remaining rent balance of ₹${remainingSourceBalance} for source GRN '${sourceGrn.grnNumber}'`,
      );
    }
    const payThisSource = Math.min(sourcePaymentAmount, remainingSourceBalance);
    if (payThisSource > 0) {
      const receiptNumber = await counterService.generateRentReceiptNumber(facilityId, movementDate, session);
      await rentRepository.createPayment({
        id: `rent-pay-${randomUUID()}`, facilityId, grnId: sourceGrn.id, grnNumber: sourceGrn.grnNumber,
        customerId: sourceGrn.customerId, customerName: sourceGrn.customerName,
        receiptNumber, amountPaid: payThisSource, paymentMode: (sourcePaymentMode ?? 'Cash') as 'Cash' | 'UPI',
        paymentDate: movementDate, notes: `Pre-merge settlement: GRN ${sourceGrn.grnNumber}${params.targetGrnNumber ? ` (merged into ${params.targetGrnNumber})` : ''}`, createdBy: userId,
      }, session);
      totalPaid += payThisSource;
      paidAmount = payThisSource;
    }
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
    paidAmount,
  };
}

export {
  formatMergeSourceAuditNote,
  formatMergeSourceSummary,
  type FormatMergeSourceAuditNoteParams,
  type FormatMergeSourceSummaryParams,
} from './merge-grn-remarks.helper.js';

export {
  closeSourceGrnOnMerge,
  type CloseSourceGrnParams,
} from './merge-source-move.helper.js';
