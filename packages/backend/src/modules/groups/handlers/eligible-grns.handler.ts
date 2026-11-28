import type { Grn } from '@cold-storage/contracts';
import { GrnModel } from '../../../database/models/grn.model.js';
import { toGrnEntity } from '../../grn/grn.mappers.js';
import { readLedgerBalanceMany, readLedgerNetDeliveredMany } from '../../inventory/ledger-balance.js';

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

  const grnIds = docs.map((d) => d.id);
  const [balanceMap, deliveredMap] = await Promise.all([
    readLedgerBalanceMany(facilityId, grnIds),
    readLedgerNetDeliveredMany(facilityId, grnIds),
  ]);

  const items: Grn[] = docs.map((d) => {
    const netDelivered = deliveredMap.get(d.id)?.total ?? 0;
    const bal = balanceMap.get(d.id);
    const isMergedSource = Boolean(
      (d as Record<string, unknown>).mergedIntoGrnId ||
      (d as Record<string, unknown>).mergedIntoGrnNumber,
    );
    const closing = isMergedSource
      ? 0
      : (bal != null ? bal.total : Math.max(0, d.bags - netDelivered));
    return toGrnEntity(d, {
      netDeliveredBags: netDelivered,
      closingBags: closing,
    });
  });

  return { items, total, page, limit };
}
