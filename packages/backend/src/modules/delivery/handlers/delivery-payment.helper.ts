import type mongoose from 'mongoose';
import { randomUUID } from 'node:crypto';
import { resolveTotalRentObligation, type PaymentMode } from '@cold-storage/contracts';
import { CommodityModel } from '../../../database/models/commodity.model.js';
import { DeliveryChallanModel } from '../../../database/models/delivery-challan.model.js';
import { RentPaymentModel } from '../../../database/models/rent-payment.model.js';
import { counterService } from '../../common/counter.service.js';
import { computeFirstSeasonHamali } from '../../common/hamali-resolution.js';
import { rentExtensionRepository } from '../../rent/rent-extension.repository.js';

export interface RecordDeliveryInlinePaymentParams {
  facilityId: string;
  grnId: string;
  grnNumber: string;
  deliveryDate: Date;
  paymentAmount?: number | null;
  paymentMode?: PaymentMode | null;
  paymentReference?: string | null;
  remainingLiability?: number | null;
  userId: string;
  session: mongoose.ClientSession;
}

export async function recordDeliveryInlinePayment(
  params: RecordDeliveryInlinePaymentParams,
): Promise<{ paidAmount: number; receiptNumber: string | null }> {
  const {
    facilityId,
    grnId,
    grnNumber,
    deliveryDate,
    paymentAmount,
    paymentMode,
    paymentReference,
    remainingLiability,
    userId,
    session,
  } = params;

  if (paymentAmount == null || paymentAmount <= 0) {
    return { paidAmount: 0, receiptNumber: null };
  }

  if (remainingLiability != null && paymentAmount > remainingLiability) {
    throw new Error(
      `Requested payment ₹${paymentAmount} exceeds remaining rent balance of ₹${remainingLiability} for GRN '${grnNumber}'`,
    );
  }

  const receiptNumber = await counterService.generateRentReceiptNumber(
    facilityId,
    deliveryDate,
    session,
  );

  await RentPaymentModel.create(
    [
      {
        id: `rent-pay-${randomUUID()}`,
        facilityId,
        grnId,
        grnNumber,
        receiptNumber,
        amountPaid: paymentAmount,
        paymentMode: paymentMode ?? 'Cash',
        paymentDate: deliveryDate,
        notes: paymentReference
          ? `Outward settlement: ${paymentReference.trim()}`
          : 'Outward delivery settlement',
        createdBy: userId,
        createdAt: new Date(),
      },
    ],
    { session, ordered: true },
  );

  return { paidAmount: paymentAmount, receiptNumber };
}

/**
 * Derives the total effective rent obligation across all issued challans for closure checking.
 */
export async function resolveEffectiveDeliveryObligation(
  facilityId: string,
  grn: {
    id: string;
    rentType: string;
    rentAmount?: number | null;
    bags: number;
    commodityId: string;
    hamaliRate?: number | null;
    hamaliAmount?: number | null;
  },
  session: mongoose.ClientSession,
): Promise<number> {
  const [commodity, extensions, agg] = await Promise.all([
    CommodityModel.findOne({ id: grn.commodityId }, null, { session }).lean().exec(),
    rentExtensionRepository.findExtensionsByGrn(facilityId, grn.id, session),
    DeliveryChallanModel.aggregate([
      { $match: { facilityId, grnId: grn.id, status: 'ISSUED' } },
      { $group: { _id: null, total: { $sum: '$rentCharge' } } },
    ]).session(session),
  ]);

  const totalOutward = agg[0]?.total ?? 0;
  const hamali = computeFirstSeasonHamali(
    grn.bags,
    commodity,
    extensions,
    grn.hamaliRate,
    grn.hamaliAmount,
  );

  return resolveTotalRentObligation({
    rentType: grn.rentType as 'Monthly' | 'Seasonal' | 'Seasonal_3M',
    rentAmount: grn.rentAmount,
    outwardRentCharges: totalOutward,
    extensionAmounts: extensions.map((e) => e.finalAmount),
    hamaliShare: hamali,
  });
}
