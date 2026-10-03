import type {
  FacilityInventorySummary,
  InventoryTransaction,
  StockLedgerQuery,
} from '@cold-storage/contracts';
import { ChamberModel } from '../../../database/models/chamber.model.js';
import { CommodityModel } from '../../../database/models/commodity.model.js';
import { InventoryTransactionModel } from '../../../database/models/inventory-transaction.model.js';
import { PositionModel } from '../../../database/models/position.model.js';
import { toLedgerEntity } from '../inventory.mappers.js';

export async function getFacilityInventorySummary(
  facilityId: string,
): Promise<FacilityInventorySummary> {
  const commodityAgg = await InventoryTransactionModel.aggregate([
    { $match: { facilityId } },
    {
      $group: {
        _id: '$commodityId',
        totalBags: {
          $sum: {
            $cond: [
              { $eq: ['$transactionType', 'OUTWARD_DELIVERY'] },
              { $multiply: ['$quantity', -1] },
              '$quantity',
            ],
          },
        },
      },
    },
  ]);

  const commodityIds = commodityAgg.map((c) => c._id);
  const commodities = await CommodityModel.find({ id: { $in: commodityIds } })
    .lean()
    .exec();
  const commodityMap = new Map(commodities.map((c) => [c.id, c.name]));

  const byCommodity = commodityAgg.map((c) => ({
    commodityId: c._id,
    commodityName: commodityMap.get(c._id) ?? 'Unknown',
    totalBags: c.totalBags,
  }));

  const chamberAgg = await InventoryTransactionModel.aggregate([
    { $match: { facilityId } },
    {
      $group: {
        _id: '$chamberId',
        totalBags: {
          $sum: {
            $cond: [
              { $eq: ['$transactionType', 'OUTWARD_DELIVERY'] },
              { $multiply: ['$quantity', -1] },
              '$quantity',
            ],
          },
        },
      },
    },
  ]);

  const chamberIds = chamberAgg.map((c) => c._id);
  const chambers = await ChamberModel.find({ id: { $in: chamberIds } })
    .lean()
    .exec();
  const chamberMap = new Map(chambers.map((c) => [c.id, c.chamberNumber]));

  const byChamber = chamberAgg.map((c) => ({
    chamberId: c._id,
    chamberNumber: chamberMap.get(c._id) ?? 'Unknown',
    totalBags: c.totalBags,
  }));

  const totalStockBags = byCommodity.reduce((sum, c) => sum + c.totalBags, 0);

  return {
    facilityId,
    totalStockBags,
    byCommodity,
    byChamber,
  };
}

export async function queryStockLedger(
  facilityId: string,
  query: StockLedgerQuery,
): Promise<{ items: InventoryTransaction[]; total: number; page: number; limit: number }> {
  const filter: Record<string, unknown> = { facilityId };
  if (query.grnId) filter.grnId = query.grnId;
  if (query.positionId) filter.positionId = query.positionId;
  if (query.chamberId) filter.chamberId = query.chamberId;
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

export async function resolveFacilityIdForPosition(positionId: string): Promise<string | null> {
  const pos = await PositionModel.findOne({ id: positionId }).select('facilityId').lean().exec();
  return pos?.facilityId ?? null;
}
