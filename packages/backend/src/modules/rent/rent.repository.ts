import type { ClientSession } from 'mongoose';
import { DeliveryChallanModel } from '../../database/models/delivery-challan.model.js';
import { RentPaymentModel, type RentPaymentDoc } from '../../database/models/rent-payment.model.js';

export interface OutwardRentInfo {
  total: number;
  earliestCreatedAt: Date | null;
}

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

  /** Payments for a specific set of GRNs. Scoped counterpart of the facility-wide query. */
  public async findPaymentsByGrnIdsGrouped(
    facilityId: string,
    grnIds: string[],
  ): Promise<Map<string, RentPaymentDoc[]>> {
    const docs = await RentPaymentModel.find({ facilityId, grnId: { $in: grnIds } }, null, { lean: true })
      .sort({ paymentDate: -1, _id: -1 })
      .lean<RentPaymentDoc[]>()
      .exec();
    const grouped = new Map<string, RentPaymentDoc[]>();
    for (const doc of docs) {
      const existing = grouped.get(doc.grnId);
      if (existing) existing.push(doc);
      else grouped.set(doc.grnId, [doc]);
    }
    return grouped;
  }

  /** Outward rent charges and earliest creation date for a specific set of GRNs. */
  public async getOutwardRentInfoByGrnIdsGrouped(
    facilityId: string,
    grnIds: string[],
  ): Promise<Map<string, OutwardRentInfo>> {
    const agg = await DeliveryChallanModel.aggregate([
      { $match: { facilityId, status: 'ISSUED', grnId: { $in: grnIds } } },
      {
        $group: {
          _id: '$grnId',
          total: { $sum: '$rentCharge' },
          earliestCreatedAt: {
            $min: { $cond: [{ $gt: ['$rentCharge', 0] }, '$createdAt', null] },
          },
        },
      },
    ]);
    const grouped = new Map<string, OutwardRentInfo>();
    for (const doc of agg) {
      grouped.set(doc._id, {
        total: doc.total ?? 0,
        earliestCreatedAt: doc.earliestCreatedAt ? new Date(doc.earliestCreatedAt) : null,
      });
    }
    return grouped;
  }

  public async getOutwardRentChargesByGrnIdsGrouped(
    facilityId: string,
    grnIds: string[],
  ): Promise<Map<string, number>> {
    const info = await this.getOutwardRentInfoByGrnIdsGrouped(facilityId, grnIds);
    const charges = new Map<string, number>();
    for (const [k, v] of info) charges.set(k, v.total);
    return charges;
  }

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
      if (existing) existing.push(doc);
      else grouped.set(doc.grnId, [doc]);
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

  public async getOutwardRentInfoForGrn(
    facilityId: string,
    grnId: string,
    session?: ClientSession,
  ): Promise<OutwardRentInfo> {
    const agg = await DeliveryChallanModel.aggregate([
      { $match: { facilityId, grnId, status: 'ISSUED' } },
      {
        $group: {
          _id: null,
          total: { $sum: '$rentCharge' },
          earliestCreatedAt: {
            $min: { $cond: [{ $gt: ['$rentCharge', 0] }, '$createdAt', null] },
          },
        },
      },
    ]).session(session ?? null);

    return {
      total: agg[0]?.total ?? 0,
      earliestCreatedAt: agg[0]?.earliestCreatedAt ? new Date(agg[0].earliestCreatedAt) : null,
    };
  }

  public async getOutwardRentChargesForGrn(
    facilityId: string,
    grnId: string,
    session?: ClientSession,
  ): Promise<number> {
    const res = await this.getOutwardRentInfoForGrn(facilityId, grnId, session);
    return res.total;
  }

  public async getOutwardRentInfoByFacilityGrouped(
    facilityId: string,
  ): Promise<Map<string, OutwardRentInfo>> {
    const agg = await DeliveryChallanModel.aggregate([
      { $match: { facilityId, status: 'ISSUED' } },
      {
        $group: {
          _id: '$grnId',
          total: { $sum: '$rentCharge' },
          earliestCreatedAt: {
            $min: { $cond: [{ $gt: ['$rentCharge', 0] }, '$createdAt', null] },
          },
        },
      },
    ]);

    const grouped = new Map<string, OutwardRentInfo>();
    for (const doc of agg) {
      grouped.set(doc._id, {
        total: doc.total ?? 0,
        earliestCreatedAt: doc.earliestCreatedAt ? new Date(doc.earliestCreatedAt) : null,
      });
    }
    return grouped;
  }

  public async getOutwardRentChargesByFacilityGrouped(
    facilityId: string,
  ): Promise<Map<string, number>> {
    const info = await this.getOutwardRentInfoByFacilityGrouped(facilityId);
    const charges = new Map<string, number>();
    for (const [k, v] of info) charges.set(k, v.total);
    return charges;
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
      customerId?: string | null;
      customerName?: string | null;
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
