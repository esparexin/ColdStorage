import type mongoose from 'mongoose';
import { randomUUID } from 'node:crypto';
import type { PaymentMode } from '@cold-storage/contracts';
import { RentPaymentModel } from '../../../database/models/rent-payment.model.js';
import { counterService } from '../../common/counter.service.js';

export interface RecordDeliveryInlinePaymentParams {
  facilityId: string;
  grnId: string;
  grnNumber: string;
  deliveryDate: Date;
  paymentAmount?: number | null;
  paymentMode?: PaymentMode | null;
  paymentReference?: string | null;
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
    userId,
    session,
  } = params;

  if (paymentAmount == null || paymentAmount <= 0) {
    return { paidAmount: 0, receiptNumber: null };
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
