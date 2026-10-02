import type {
  GrnInventorySummary,
  PositionOccupancy,
  PutAwayAllocation,
  PutAwayStatus,
} from '@cold-storage/contracts';
import { GrnModel } from '../../../database/models/grn.model.js';
import { InventoryTransactionModel } from '../../../database/models/inventory-transaction.model.js';
import { PositionModel } from '../../../database/models/position.model.js';
import { PutAwayAllocationModel } from '../../../database/models/put-away.model.js';
import { toPutAwayEntity } from '../inventory.mappers.js';

export async function listPutAwayAllocations(
  facilityId: string,
  grnId: string,
): Promise<PutAwayAllocation[]> {
  const docs = await PutAwayAllocationModel.find({ facilityId, grnId })
    .sort({ allocatedAt: -1 })
    .lean()
    .exec();
  return docs.map((d: any) => toPutAwayEntity(d));
}

export async function getGrnInventorySummary(
  facilityId: string,
  grnId: string,
): Promise<GrnInventorySummary> {
  const grn = await GrnModel.findOne({ id: grnId, facilityId }).lean().exec();
  if (!grn) {
    throw new Error(`GRN '${grnId}' not found in facility '${facilityId}'`);
  }

  const positionAgg = await InventoryTransactionModel.aggregate([
    { $match: { grnId, facilityId } },
    {
      $group: {
        _id: { positionId: '$positionId', positionCode: '$positionCode' },
        bags: { $sum: '$quantity' },
      },
    },
  ]);

  const positions = positionAgg.map((p) => ({
    positionId: p._id.positionId,
    positionCode: p._id.positionCode,
    bags: p.bags,
  }));

  const allocatedBags = positions.reduce((sum, p) => sum + p.bags, 0);
  const unallocatedBags = Math.max(0, grn.bags - allocatedBags);

  let putAwayStatus: PutAwayStatus = 'UNALLOCATED';
  if (allocatedBags >= grn.bags) {
    putAwayStatus = 'FULLY_ALLOCATED';
  } else if (allocatedBags > 0) {
    putAwayStatus = 'PARTIALLY_ALLOCATED';
  }

  return {
    grnId: grn.id,
    facilityId: grn.facilityId,
    grnNumber: grn.grnNumber,
    chamberId: grn.chamberId,
    chamberNumber: grn.chamberNumber,
    totalBags: grn.bags,
    allocatedBags,
    unallocatedBags,
    putAwayStatus,
    positions,
  };
}

export async function getPositionOccupancy(
  facilityId: string,
  positionId: string,
): Promise<PositionOccupancy> {
  const position = await PositionModel.findOne({ id: positionId, facilityId }).lean().exec();
  if (!position) {
    throw new Error(`Position '${positionId}' not found in facility '${facilityId}'`);
  }

  const lotsAgg = await InventoryTransactionModel.aggregate([
    { $match: { positionId, facilityId } },
    {
      $group: {
        _id: {
          grnId: '$grnId',
          grnNumber: '$grnNumber',
          customerId: '$customerId',
          commodityId: '$commodityId',
          bagType: '$bagType',
        },
        bags: {
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

  const storedLots = lotsAgg
    .filter((lot) => lot.bags > 0)
    .map((lot) => ({
      grnId: lot._id.grnId,
      grnNumber: lot._id.grnNumber,
      customerId: lot._id.customerId,
      commodityId: lot._id.commodityId,
      bagType: lot._id.bagType,
      bags: lot.bags,
    }));

  const occupiedBags = storedLots.reduce((sum, lot) => sum + lot.bags, 0);
  const availableBags = Math.max(0, position.capacityBags - occupiedBags);
  const utilizationRate =
    position.capacityBags > 0
      ? Math.round(((occupiedBags / position.capacityBags) * 100 + Number.EPSILON) * 100) / 100
      : 0;

  return {
    positionId: position.id,
    facilityId: position.facilityId,
    chamberId: position.chamberId,
    rackId: position.rackId,
    levelId: position.levelId,
    code: position.code,
    capacityBags: position.capacityBags,
    occupiedBags,
    availableBags,
    utilizationRate,
    storedLots,
  };
}
