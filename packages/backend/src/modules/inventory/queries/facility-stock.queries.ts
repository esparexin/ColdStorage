import type {
  FacilityInventorySummary,
  InventoryTransaction,
  StockLedgerQuery,
} from '@cold-storage/contracts';
import { CommodityModel } from '../../../database/models/commodity.model.js';
import { GrnModel } from '../../../database/models/grn.model.js';
import { InventoryTransactionModel } from '../../../database/models/inventory-transaction.model.js';
import { readLedgerGroupedPairs } from '../ledger-balance.js';
import { toLedgerEntity } from '../inventory.mappers.js';

export async function getFacilityInventorySummary(
  facilityId: string,
): Promise<FacilityInventorySummary> {
  const pairs = await readLedgerGroupedPairs(facilityId, 'commodityId', 'chamber');

  const byCommodityMap = new Map<string, number>();
  const byChamberMap = new Map<string, number>();

  for (const pair of pairs) {
    if (pair.total > 0) {
      byCommodityMap.set(pair.first, (byCommodityMap.get(pair.first) ?? 0) + pair.total);
      byChamberMap.set(pair.second, (byChamberMap.get(pair.second) ?? 0) + pair.total);
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
  if (query.customerId) {
    // Ledger rows carry no customer: a customer filter resolves to that customer's GRNs first,
    // so the balance partition stays the GRN and a customer can never be double-counted.
    const grns = await GrnModel.find({ facilityId, customerId: query.customerId }, { id: 1 })
      .lean()
      .exec();
    filter.grnId = { $in: grns.map((g) => g.id) };
  }

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
