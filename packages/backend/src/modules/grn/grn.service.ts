import type {
  CorrectGrnInput,
  CreateGrnInput,
  Grn,
  GrnAcknowledgement,
  GrnMovementHistory,
  GrnQuery,
  UpdateGrnLoanStatusInput,
} from '@cold-storage/contracts';
import { GrnModel } from '../../database/models/grn.model.js';
import { readLedgerNetDelivered, readLedgerNetDeliveredMany } from '../inventory/ledger-balance.js';
import { counterService } from '../common/counter.service.js';
import { getGrnMovementHistory } from '../common/grn-movement-history.js';
import { toGrnAcknowledgement, toGrnEntity } from './grn.mappers.js';
import { createGrn } from './handlers/create-grn.handler.js';
import { correctGrn } from './handlers/update-grn.handler.js';
import { updateGrnLoanStatus } from './handlers/update-grn-loan-status.handler.js';

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

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

  /** Update loan/pledge status for inward consignment with audit trail */
  public async updateLoanStatus(
    facilityId: string,
    grnId: string,
    input: UpdateGrnLoanStatusInput,
    userId: string,
  ): Promise<Grn> {
    return updateGrnLoanStatus(facilityId, grnId, input, userId);
  }

  public async getGrnById(id: string): Promise<Grn | null> {
    const doc = await GrnModel.findOne({ id }).lean().exec();
    if (!doc) return null;
    const netDelivered = await readLedgerNetDelivered(doc.facilityId, id);
    const closing = Math.max(0, doc.bags - netDelivered.total);
    return toGrnEntity(doc, { netDeliveredBags: netDelivered.total, closingBags: closing });
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
    if (query.search && query.search.trim()) {
      const regex = { $regex: escapeRegExp(query.search.trim()), $options: 'i' };
      filter.$or = [
        { grnNumber: regex },
        { inwardReceiptNumber: regex },
        { customerName: regex },
        { commodityName: regex },
        { gpNumber: regex },
        { vehicleNumber: regex },
        { bondNumber: regex },
      ];
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

    const deliveryMap = await readLedgerNetDeliveredMany(
      facilityId,
      docs.map((d) => d.id),
    );

    return {
      items: docs.map((d) => {
        const netDelivered = deliveryMap.get(d.id)?.total ?? 0;
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

  public async getNextBillNumber(facilityId: string): Promise<string> {
    return counterService.previewNextInwardReceiptNumber(facilityId, new Date());
  }

  /** Preview of the next GR Number, the sole business key for the goods lifecycle. */
  public async getNextGrnNumber(facilityId: string): Promise<string> {
    return counterService.previewNextGrnNumber(facilityId, new Date());
  }

  public async getGrnMovementHistory(
    facilityId: string,
    grnId: string,
  ): Promise<GrnMovementHistory | null> {
    return getGrnMovementHistory(facilityId, grnId);
  }
}

export const grnService = new GrnService();
