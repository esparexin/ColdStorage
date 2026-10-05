import { CommodityModel } from '../../database/models/commodity.model.js';
import { DeliveryChallanModel } from '../../database/models/delivery-challan.model.js';
import { DeliveryReversalModel } from '../../database/models/delivery-reversal.model.js';
import { GrnModel } from '../../database/models/grn.model.js';
import { InventoryTransactionModel } from '../../database/models/inventory-transaction.model.js';
import { ledgerBagQuantity, ledgerSignedQuantity } from '../inventory/ledger-polarity.js';

export function getIstMonthlyWindow(date: Date = new Date()): {
  startOfMonth: Date;
  startOfNextMonth: Date;
} {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
  });
  const parts = formatter.formatToParts(date);
  const yearStr = parts.find((p) => p.type === 'year')?.value ?? '';
  const monthStr = parts.find((p) => p.type === 'month')?.value ?? '';
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10);

  const startOfMonth = new Date(
    `${year}-${String(month).padStart(2, '0')}-01T00:00:00.000+05:30`,
  );
  const nextMonthYear = month === 12 ? year + 1 : year;
  const nextMonth = month === 12 ? 1 : month + 1;
  const startOfNextMonth = new Date(
    `${nextMonthYear}-${String(nextMonth).padStart(2, '0')}-01T00:00:00.000+05:30`,
  );
  return { startOfMonth, startOfNextMonth };
}

export const APPROVED_RECENT_TYPES = [
  'INWARD_PUTAWAY',
  'OUTWARD_DELIVERY',
  'DELIVERY_REVERSAL',
] as const;

function monthlyLedgerCond(type: string, start: Date, end: Date, mult = 1) {
  return {
    $cond: [
      { $and: [{ $eq: ['$transactionType', type] }, { $gte: ['$createdAt', start] }, { $lt: ['$createdAt', end] }] },
      mult === 1 ? ledgerBagQuantity : { $multiply: [ledgerBagQuantity, mult] },
      0,
    ],
  };
}

async function fetchLedgerStockData(
  facilityId: string,
  startOfMonth: Date,
  startOfNextMonth: Date,
) {
  const [totalAgg, chamberCommodityAgg] = await Promise.all([
    InventoryTransactionModel.aggregate<{ _id: null; totalBags: number; monthlyInward: number; monthlyDelivered: number }>([
      { $match: { facilityId } },
      {
        $group: {
          _id: null,
          totalBags: { $sum: ledgerSignedQuantity },
          monthlyInward: { $sum: monthlyLedgerCond('INWARD_PUTAWAY', startOfMonth, startOfNextMonth) },
          monthlyDelivered: {
            $sum: {
              $add: [
                monthlyLedgerCond('OUTWARD_DELIVERY', startOfMonth, startOfNextMonth),
                monthlyLedgerCond('DELIVERY_REVERSAL', startOfMonth, startOfNextMonth, -1),
              ],
            },
          },
        },
      },
    ]),
    InventoryTransactionModel.aggregate<{
      byChamber: Array<{ _id: string; totalBags: number }>;
      byCommodity: Array<{ _id: string; totalBags: number }>;
    }>([
      { $match: { facilityId } },
      {
        $facet: {
          byChamber: [{ $group: { _id: '$chamber', totalBags: { $sum: ledgerSignedQuantity } } }],
          byCommodity: [
            { $group: { _id: '$commodityId', totalBags: { $sum: ledgerSignedQuantity } } },
            { $match: { totalBags: { $gt: 0 } } },
          ],
        },
      },
    ]),
  ]);

  return { totalAgg, chamberCommodityAgg };
}

export async function fetchPhaseAData(
  facilityId: string,
  startOfMonth: Date,
  startOfNextMonth: Date,
) {
  // No source switching: the ledger carries the inward leg for every receipt, so it is the
  // balance for every facility, including ones that have never recorded a delivery.
  const [stockData, grnStatusAgg, recentTxns] = await Promise.all([
    fetchLedgerStockData(facilityId, startOfMonth, startOfNextMonth),
    GrnModel.aggregate<{ _id: string; count: number }>([
      { $match: { facilityId } },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]),
    InventoryTransactionModel.find({
      facilityId,
      transactionType: { $in: [...APPROVED_RECENT_TYPES] },
    })
      .sort({ createdAt: -1 })
      .limit(10)
      .lean()
      .exec(),
  ]);

  return [stockData.totalAgg, stockData.chamberCommodityAgg, grnStatusAgg, recentTxns] as const;
}

export async function fetchPhaseBData(
  facilityId: string,
  commodityIds: string[],
  deliveryIds: string[],
  reversalIds: string[],
) {
  return Promise.all([
    commodityIds.length > 0
      ? CommodityModel.find({ id: { $in: commodityIds } })
          .select('id name')
          .lean()
          .exec()
      : Promise.resolve([]),
    deliveryIds.length > 0
      ? DeliveryChallanModel.find({ facilityId, id: { $in: deliveryIds } })
          .select('id challanNumber')
          .lean()
          .exec()
      : Promise.resolve([]),
    reversalIds.length > 0
      ? DeliveryReversalModel.find({ facilityId, id: { $in: reversalIds } })
          .select('id challanNumber')
          .lean()
          .exec()
      : Promise.resolve([]),
  ]);
  
}