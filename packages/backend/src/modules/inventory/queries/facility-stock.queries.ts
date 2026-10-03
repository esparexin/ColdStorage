import type {
  FacilityInventorySummary,
  InventoryTransaction,
  StockLedgerQuery,
} from '@cold-storage/contracts';
import { CommodityModel } from '../../../database/models/commodity.model.js';
import { InventoryTransactionModel } from '../../../database/models/inventory-transaction.model.js';
import { toLedgerEntity } from '../inventory.mappers.js';
import { ledgerSignedQuantity } from '../ledger-polarity.js';

export async function getFacilityInventorySummary(
  facilityId: string,
): Promise<FacilityInventorySummary> {
  const agg = await InventoryTransactionModel.aggregate([
    { $match: { facilityId } },
    {
      $group: {
        _id: { commodityId: '$commodityId', chamber: '$chamber' },
        totalBags: { $sum: ledgerSignedQuantity },
      },
    },
    { $match: { totalBags: { $gt: 0 } } },
    { $sort: { totalBags: -1 } },
  ]);

  const commodityIds = [...new Set(agg.map((r) => r._id.commodityId as string))];
  const commodities = await CommodityModel.find({ id: { $in: commodityIds } })
    .lean()
    .exec();
  const commodityMap = new Map(commodities.map((c) => [c.id, c.name]));

  const byCommodityMap = new Map<string, number>();
  const byChamberMap = new Map<string, number>();
  for (const row of agg) {
    const bags = row.totalBags as number;
    const commodityId = String(row._id.commodityId);
    const chamber = String(row._id.chamber);
    byCommodityMap.set(commodityId, (byCommodityMap.get(commodityId) ?? 0) + bags);
    byChamberMap.set(chamber, (byChamberMap.get(chamber) ?? 0) + bags);
  }

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
