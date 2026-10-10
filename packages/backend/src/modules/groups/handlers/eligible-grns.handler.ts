import type { Grn } from '@cold-storage/contracts';
import { GrnModel } from '../../../database/models/grn.model.js';
import { grnService } from '../../grn/grn.service.js';

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export async function listEligibleGrns(
  facilityId: string,
  options: {
    search?: string;
    customerId?: string;
    commodityId?: string;
    page?: number;
    limit?: number;
  },
): Promise<{ items: Grn[]; total: number; page: number; limit: number }> {
  const filter: Record<string, unknown> = {
    facilityId,
    $or: [{ groupId: null }, { groupId: { $exists: false } }],
  };

  if (options.customerId) {
    filter.customerId = options.customerId;
  }
  if (options.commodityId) {
    filter.commodityId = options.commodityId;
  }
  if (options.search && options.search.trim()) {
    const regex = { $regex: escapeRegExp(options.search.trim()), $options: 'i' };
    filter.$and = [
      {
        $or: [
          { grnNumber: regex },
          { customerName: regex },
          { commodityName: regex },
          { vehicleNumber: regex },
        ],
      },
    ];
  }

  const page = Math.max(1, options.page || 1);
  const limit = Math.min(100, Math.max(1, options.limit || 20));
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

  const grnResult = await grnService.listGrns(facilityId, {
    page,
    limit,
    customerId: options.customerId,
    commodityId: options.commodityId,
    search: options.search,
  });

  const eligibleIds = new Set(docs.map((d) => d.id));
  const items = grnResult.items.filter((item) => eligibleIds.has(item.id));

  return { items, total, page, limit };
}
