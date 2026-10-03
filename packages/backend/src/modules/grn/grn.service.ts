import type {
  CorrectGrnInput,
  CreateGrnInput,
  Grn,
  GrnAcknowledgement,
  GrnQuery,
} from '@cold-storage/contracts';
import { GrnModel } from '../../database/models/grn.model.js';
import { InventoryTransactionModel } from '../../database/models/inventory-transaction.model.js';
import { toGrnAcknowledgement, toGrnEntity } from './grn.mappers.js';
import { createGrn } from './handlers/create-grn.handler.js';
import { correctGrn } from './handlers/update-grn.handler.js';

export class GrnService {
  public async createGrn(
    facilityId: string,
    input: CreateGrnInput,
    userId: string,
  ): Promise<{ grn: Grn; acknowledgement: GrnAcknowledgement }> {
    return createGrn(facilityId, input, userId);
  }

  /** Authorized receipt correction; audits the before/after state. */
  public async correctGrn(
    facilityId: string,
    grnId: string,
    input: CorrectGrnInput,
    userId: string,
  ): Promise<Grn> {
    return correctGrn(facilityId, grnId, input, userId);
  }

  public async getGrnById(id: string): Promise<Grn | null> {
    const doc = await GrnModel.findOne({ id }).lean().exec();
    if (!doc) return null;
    const agg = await InventoryTransactionModel.aggregate([
      {
        $match: {
          grnId: id,
          transactionType: { $in: ['OUTWARD_DELIVERY', 'DELIVERY_REVERSAL'] },
        },
      },
      {
        $group: {
          _id: null,
          netDelivered: {
            $sum: {
              $cond: [{ $eq: ['$transactionType', 'OUTWARD_DELIVERY'] }, '$quantity', { $multiply: ['$quantity', -1] }],
            },
          },
        },
      },
    ]);
    const netDelivered = agg[0]?.netDelivered ?? 0;
    const closing = Math.max(0, doc.bags - netDelivered);
    return toGrnEntity(doc, { netDeliveredBags: netDelivered, closingBags: closing });
  }

  public async getAcknowledgementByGrnId(id: string): Promise<GrnAcknowledgement | null> {
    const grn = await this.getGrnById(id);
    return grn ? toGrnAcknowledgement(grn) : null;
  }

  public async listGrns(
    facilityId: string,
    query: GrnQuery,
  ): Promise<{ items: Grn[]; total: number; page: number; limit: number }> {
    const filter: Record<string, unknown> = { facilityId };

    if (query.customerId) {
      filter.customerId = query.customerId;
    }
    if (query.commodityId) {
      filter.commodityId = query.commodityId;
    }
    if (query.chamber) {
      filter.chamber = query.chamber;
    }
    if (query.status) {
      filter.status = query.status;
    }

    const page = Math.max(1, query.page || 1);
    const limit = Math.min(100, Math.max(1, query.limit || 20));
    const skip = (page - 1) * limit;

    const [docs, total] = await Promise.all([
      GrnModel.find(filter)
        .sort({ date: -1, createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean()
        .exec(),
      GrnModel.countDocuments(filter).exec(),
    ]);

    const grnIds = docs.map((d) => d.id);
    const deliveryAgg = await InventoryTransactionModel.aggregate([
      {
        $match: {
          facilityId,
          grnId: { $in: grnIds },
          transactionType: { $in: ['OUTWARD_DELIVERY', 'DELIVERY_REVERSAL'] },
        },
      },
      {
        $group: {
          _id: '$grnId',
          netDelivered: {
            $sum: {
              $cond: [{ $eq: ['$transactionType', 'OUTWARD_DELIVERY'] }, '$quantity', { $multiply: ['$quantity', -1] }],
            },
          },
        },
      },
    ]);
    const deliveryMap = new Map<string, number>(deliveryAgg.map((a) => [String(a._id), Number(a.netDelivered)]));

    return {
      items: docs.map((d) => {
        const netDelivered = deliveryMap.get(d.id) ?? 0;
        const closing = Math.max(0, d.bags - netDelivered);
        return toGrnEntity(d, { netDeliveredBags: netDelivered, closingBags: closing });
      }),
      total,
      page,
      limit,
    };
  }

  public async resolveFacilityIdForGrn(grnId: string): Promise<string | null> {
    const doc = await GrnModel.findOne({ id: grnId }).select('facilityId').lean().exec();
    return doc ? doc.facilityId : null;
  }
}

export const grnService = new GrnService();
