import type { ClientSession } from 'mongoose';
import { RentPaymentModel, type RentPaymentDoc } from '../../database/models/rent-payment.model.js';

export class RentRepository {
  public async findPaymentsByGrnId(
    facilityId: string,
    grnId: string,
    session?: ClientSession,
  ): Promise<RentPaymentDoc[]> {
    return RentPaymentModel.find({ facilityId, grnId }, null, { session })
      .sort({ paymentDate: -1, _id: -1 })
      .lean<RentPaymentDoc[]>()
      .exec();
  }

  public async getTotalPaidForGrn(
    facilityId: string,
    grnId: string,
    session?: ClientSession,
  ): Promise<number> {
    const agg = await RentPaymentModel.aggregate([
      { $match: { facilityId, grnId } },
      { $group: { _id: null, total: { $sum: '$amountPaid' } } },
    ]).session(session ?? null);

    return agg[0]?.total ?? 0;
  }

  public async findByReceiptNumber(
    facilityId: string,
    receiptNumber: string,
  ): Promise<RentPaymentDoc | null> {
    return RentPaymentModel.findOne({ facilityId, receiptNumber }).lean<RentPaymentDoc>().exec();
  }

  public async createPayment(
    data: {
      id: string;
      facilityId: string;
      grnId: string;
      grnNumber: string;
      receiptNumber: string;
      amountPaid: number;
      paymentMode: 'Cash' | 'UPI';
      paymentDate: Date;
      notes?: string | null;
      createdBy: string;
    },
    session?: ClientSession,
  ): Promise<RentPaymentDoc> {
    const docs = await RentPaymentModel.create([data], { session });
    return docs[0].toObject() as RentPaymentDoc;
  }
}

export const rentRepository = new RentRepository();
