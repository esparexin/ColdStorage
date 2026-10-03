import { ChamberModel } from '../../database/models/chamber.model.js';
import { CommodityModel } from '../../database/models/commodity.model.js';
import { DeliveryChallanModel } from '../../database/models/delivery-challan.model.js';
import { DeliveryReversalModel } from '../../database/models/delivery-reversal.model.js';
import { GrnModel } from '../../database/models/grn.model.js';
import { InventoryTransactionModel } from '../../database/models/inventory-transaction.model.js';
import { PositionModel } from '../../database/models/position.model.js';
import { ledgerSignedQuantity } from '../inventory/ledger-polarity.js';

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

export async function fetchPhaseAData(
  facilityId: string,
  startOfMonth: Date,
  startOfNextMonth: Date,
) {
  return Promise.all([
    PositionModel.aggregate<{ _id: string; capacityBags: number }>([
      { $match: { facilityId } },
      { $group: { _id: '$chamberId', capacityBags: { $sum: '$capacityBags' } } },
    ]),
    ChamberModel.find({ facilityId }).select('id chamberNumber isActive').lean().exec(),
    InventoryTransactionModel.aggregate<{
      _id: null;
      occupiedBags: number;
      monthlyInward: number;
      monthlyDelivered: number;
    }>([
      { $match: { facilityId } },
      {
        $group: {
          _id: null,
          occupiedBags: { $sum: ledgerSignedQuantity },
          monthlyInward: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $eq: ['$transactionType', 'INWARD_PUTAWAY'] },
                    { $gte: ['$createdAt', startOfMonth] },
                    { $lt: ['$createdAt', startOfNextMonth] },
                  ],
                },
                '$quantity',
                0,
              ],
            },
          },
          monthlyDelivered: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $eq: ['$transactionType', 'OUTWARD_DELIVERY'] },
                    { $gte: ['$createdAt', startOfMonth] },
                    { $lt: ['$createdAt', startOfNextMonth] },
                  ],
                },
                '$quantity',
                {
                  $cond: [
                    {
                      $and: [
                        { $eq: ['$transactionType', 'DELIVERY_REVERSAL'] },
                        { $gte: ['$createdAt', startOfMonth] },
                        { $lt: ['$createdAt', startOfNextMonth] },
                      ],
                    },
                    { $multiply: ['$quantity', -1] },
                    0,
                  ],
                },
              ],
            },
          },
        },
      },
    ]),
    InventoryTransactionModel.aggregate<{
      byChamber: Array<{ _id: string; occupiedBags: number }>;
      byCommodity: Array<{ _id: string; totalBags: number }>;
    }>([
      { $match: { facilityId } },
      {
        $facet: {
          byChamber: [
            { $group: { _id: '$chamberId', occupiedBags: { $sum: ledgerSignedQuantity } } },
          ],
          byCommodity: [
            { $group: { _id: '$commodityId', totalBags: { $sum: ledgerSignedQuantity } } },
            { $match: { totalBags: { $gt: 0 } } },
          ],
        },
      },
    ]),
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
