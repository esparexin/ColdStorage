import type {
  FacilityInventorySummary,
  InventoryTransaction,
  StockLedgerQuery,
} from '@cold-storage/contracts';
import { CommodityModel } from '../../../database/models/commodity.model.js';
import { DeliveryChallanModel } from '../../../database/models/delivery-challan.model.js';
import { GrnModel } from '../../../database/models/grn.model.js';
import { InventoryTransactionModel } from '../../../database/models/inventory-transaction.model.js';
import { toLedgerEntity } from '../inventory.mappers.js';

export async function getFacilityInventorySummary(
  facilityId: string,
): Promise<FacilityInventorySummary> {
  const [inwardAgg, deliveryAgg] = await Promise.all([
    GrnModel.aggregate<{ _id: { commodityId: string; chamber: string }; totalBags: number }>([
      { $match: { facilityId } },
      {
        $group: {
          _id: { commodityId: '$commodityId', chamber: '$chamber' },
          totalBags: { $sum: '$bags' },
        },
      },
    ]),
    DeliveryChallanModel.aggregate<{ _id: { commodityId: string; chamber: string }; totalBags: number }>([
      { $match: { facilityId, status: 'ISSUED' } },
      {
        $group: {
          _id: { commodityId: '$commodityId', chamber: '$chamber' },
          totalBags: { $sum: '$bags' },
        },
      },
    ]),
  ]);

  const netStockMap = new Map<string, { commodityId: string; chamber: string; bags: number }>();

  for (const row of inwardAgg) {
    const commodityId = String(row._id.commodityId);
    const chamber = String(row._id.chamber);
    const key = `${commodityId}::${chamber}`;
    netStockMap.set(key, { commodityId, chamber, bags: row.totalBags });
  }

  for (const row of deliveryAgg) {
    const commodityId = String(row._id.commodityId);
    const chamber = String(row._id.chamber);
    const key = `${commodityId}::${chamber}`;
    const existing = netStockMap.get(key);
    if (existing) {
      existing.bags -= row.totalBags;
    }
  }

  const byCommodityMap = new Map<string, number>();
  const byChamberMap = new Map<string, number>();

  for (const item of netStockMap.values()) {
    if (item.bags > 0) {
      byCommodityMap.set(item.commodityId, (byCommodityMap.get(item.commodityId) ?? 0) + item.bags);
      byChamberMap.set(item.chamber, (byChamberMap.get(item.chamber) ?? 0) + item.bags);
    }
  }

  const commodityIds = [...byCommodityMap.keys()];
  const commodities = await CommodityModel.find({ id: { $in: commodityIds } })
    .lean()
    .exec();
  const commodityMap = new Map(commodities.map((c) => [c.id, c.name]));

  const byCommodity = [...byCommodityMap.entries()]
    .map(([commodityId, totalBags]) => ({
      commodityId,
      commodityName: commodityMap.get(commodityId) ?? 'Unknown',
      totalBags,
    }))
    .sort((a, b) => b.totalBags - a.totalBags);

  const byChamber = [...byChamberMap.entries()]
    .map(([chamber, totalBags]) => ({ chamber, totalBags }))
    .sort((a, b) => b.totalBags - a.totalBags);

  const totalStockBags = byCommodity.reduce((sum, c) => sum + c.totalBags, 0);

  return { facilityId, totalStockBags, byCommodity, byChamber };
}

export async function queryStockLedger(
  facilityId: string,
  query: StockLedgerQuery,
): Promise<{ items: InventoryTransaction[]; total: number; page: number; limit: number }> {
  const filter: Record<string, unknown> = { facilityId };
  if (query.grnId) filter.grnId = query.grnId;
  if (query.chamber) filter.chamber = query.chamber;
  if (query.commodityId) filter.commodityId = query.commodityId;
  if (query.customerId) filter.customerId = query.customerId;

  const skip = (query.page - 1) * query.limit;

  const [docs, total] = await Promise.all([
    InventoryTransactionModel.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(query.limit)
      .lean()
      .exec(),
    InventoryTransactionModel.countDocuments(filter).exec(),
  ]);

  return {
    items: docs.map((d) => toLedgerEntity(d)),
    total,
    page: query.page,
    limit: query.limit,
  };
}
