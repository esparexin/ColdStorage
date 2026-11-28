import { randomUUID } from 'node:crypto';
import type mongoose from 'mongoose';
import {
  calculateHamaliAmount,
  isEligibleCurrentLiveSubscriptionGrn,
  type RentPayment,
} from '@cold-storage/contracts';
import { CommodityModel } from '../../../database/models/commodity.model.js';
import { counterService } from '../../common/counter.service.js';
import { toPaymentEntity } from '../../rent/handlers/record-payment.handler.js';
import { rentRepository } from '../../rent/rent.repository.js';

export interface RepackHamaliResolution {
  isRepackingSelected: boolean;
  repackHamaliBags: number;
  repackHamaliRate: number;
  repackHamaliCharge: number;
}

/**
 * Checks whether the target GRN is under an active/running/live subscription as of movementDate.
 */
export function isLiveSubscriptionTarget(
  targetGrn: { date: Date | string; rentType: string },
  moveDate: Date | string,
): boolean {
  return isEligibleCurrentLiveSubscriptionGrn({
    inwardDate: targetGrn.date,
    asOfDate: moveDate,
    rentType: targetGrn.rentType,
  });
}

/**
 * Generates an authoritative Cash Memo for Hamali charges only when merging into an active subscription lot.
 */
export async function generateMergeHamaliCashMemo(params: {
  facilityId: string;
  targetGrn: {
    id: string;
    grnNumber: string;
    customerId?: string | null;
    customerName?: string | null;
    date: Date;
    rentType: string;
  };
  sourceGrnNumbers?: string[];
  repackHamali: RepackHamaliResolution;
  moveDate: Date;
  paymentMode?: string | null;
  paymentAmount?: number | null;
  userId: string;
  session: mongoose.ClientSession;
}): Promise<RentPayment | null> {
  const { facilityId, targetGrn, sourceGrnNumbers = [], repackHamali, moveDate, paymentMode, paymentAmount, userId, session } = params;
  if (repackHamali.repackHamaliCharge <= 0) return null;
  if (!isLiveSubscriptionTarget(targetGrn, moveDate)) return null;
  if (typeof paymentAmount !== 'number' || paymentAmount <= 0) return null;

  const sourceStr = sourceGrnNumbers.length > 0 ? `, Source GRN(s) ${sourceGrnNumbers.map((s) => `#${s}`).join(', ')}` : '';
  const receiptNumber = await counterService.generateRentReceiptNumber(facilityId, moveDate, session);
  const paymentDoc = await rentRepository.createPayment(
    {
      id: `rp-${randomUUID()}`,
      facilityId,
      grnId: targetGrn.id,
      grnNumber: targetGrn.grnNumber,
      customerId: targetGrn.customerId,
      customerName: targetGrn.customerName,
      receiptNumber,
      amountPaid: repackHamali.repackHamaliCharge,
      paymentMode: (paymentMode ?? 'Cash') as 'Cash' | 'UPI',
      paymentDate: moveDate,
      notes: `Consignment Merge Hamali Labor: ${repackHamali.repackHamaliBags} bags @ ₹${repackHamali.repackHamaliRate}/bag (Target GRN #${targetGrn.grnNumber}${sourceStr})`,
      createdBy: userId,
    },
    session,
  );

  return toPaymentEntity(paymentDoc);
}

/**
 * Resolves one-time repacking hamali handling charge for explicit repacking during a merge.
 * Charges only explicitly confirmed repacked bags at the commodity-configured hamali rate.
 * Returns zero charge when repacking is not selected or hamali is not applicable.
 */
export async function resolveMergeRepackHamali(params: {
  commodityId: string;
  targetHamaliRate?: number | null;
  isRepackSelected?: boolean;
  repackedSmallBags?: number | null;
  repackedBigBags?: number | null;
  repackedBagCount?: number | null;
  totalMovedBags: number;
  session: mongoose.ClientSession;
}): Promise<RepackHamaliResolution> {
  const {
    commodityId, targetHamaliRate, isRepackSelected, repackedSmallBags,
    repackedBigBags, repackedBagCount, totalMovedBags, session,
  } = params;
  if (!isRepackSelected || totalMovedBags <= 0) {
    return { isRepackingSelected: false, repackHamaliBags: 0, repackHamaliRate: 0, repackHamaliCharge: 0 };
  }

  // Calculate actual bags handled
  const actualRepackedBags =
    repackedBagCount != null && repackedBagCount > 0
      ? repackedBagCount
      : typeof repackedSmallBags === 'number' && typeof repackedBigBags === 'number'
        ? repackedSmallBags + repackedBigBags
        : totalMovedBags;

  if (actualRepackedBags <= 0) {
    return { isRepackingSelected: Boolean(isRepackSelected), repackHamaliBags: 0, repackHamaliRate: 0, repackHamaliCharge: 0 };
  }

  const commodity = await CommodityModel.findOne({ id: commodityId }, null, { session }).lean().exec();
  const effectiveHamaliRate: number = (commodity?.hamaliRate ?? 0) > 0 ? (commodity?.hamaliRate ?? 0) : (targetHamaliRate ?? 0);
  const isApplicable =
    commodity?.isHamaliApplicable !== undefined && commodity?.isHamaliApplicable !== null
      ? commodity.isHamaliApplicable
      : effectiveHamaliRate > 0;
  const rate: number = isApplicable ? effectiveHamaliRate : 0;
  const charge = rate > 0 ? calculateHamaliAmount(actualRepackedBags, rate) : 0;

  return {
    isRepackingSelected: Boolean(isRepackSelected),
    repackHamaliBags: actualRepackedBags,
    repackHamaliRate: rate,
    repackHamaliCharge: charge,
  };
}
