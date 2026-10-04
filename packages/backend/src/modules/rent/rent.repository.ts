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

  /**
   * Every payment for a facility in a single round trip, grouped by GRN.
   *
   * The rent list previously called findPaymentsByGrnId once per GRN, which
   * turned one page view into ~100 sequential MongoDB queries. Grouping in the
   * database returns the same rows in one pass; the caller reassembles them per
   * GRN using the same ordering as findPaymentsByGrnId.
   */
  public async findPaymentsByFacilityGrouped(
    facilityId: string,
  ): Promise<Map<string, RentPaymentDoc[]>> {
    const docs = await RentPaymentModel.find({ facilityId }, null, { lean: true })
      .sort({ paymentDate: -1, _id: -1 })
      .lean<RentPaymentDoc[]>()
      .exec();

    const grouped = new Map<string, RentPaymentDoc[]>();
    for (const doc of docs) {
      const existing = grouped.get(doc.grnId);
      if (existing) {
        existing.push(doc);
      } else {
        grouped.set(doc.grnId, [doc]);
      }
    }
    return grouped;
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
