import type mongoose from 'mongoose';
import { ChamberModel } from '../../../database/models/chamber.model.js';
import { InventoryTransactionModel } from '../../../database/models/inventory-transaction.model.js';
import { LevelModel } from '../../../database/models/level.model.js';
import { PositionModel } from '../../../database/models/position.model.js';
import { RackModel } from '../../../database/models/rack.model.js';

export interface LockedPositionMeta {
  code: string;
  capacityBags: number;
  chamberId: string;
}

export async function validateAndLockPutAwayPositions(
  facilityId: string,
  chamberId: string,
  items: Array<{ positionId: string; bags: number }>,
  session: mongoose.ClientSession,
): Promise<Map<string, LockedPositionMeta>> {
  const sortedItems = [...items].sort((a, b) => a.positionId.localeCompare(b.positionId));
  const lockedPositions = new Map<string, LockedPositionMeta>();

  for (const item of sortedItems) {
    const pos = await PositionModel.findOneAndUpdate(
      { id: item.positionId, facilityId },
      { $set: { updatedAt: new Date() } },
      { session, new: true },
    )
      .lean()
      .exec();

    if (!pos) {
      throw new Error(`Position '${item.positionId}' not found in facility '${facilityId}'`);
    }
    if (!pos.isActive) {
      throw new Error(`Position '${pos.code}' is inactive`);
    }
    if (pos.chamberId !== chamberId) {
      throw new Error(
        `Position '${pos.code}' belongs to chamber '${pos.chamberId}', but GRN belongs to chamber '${chamberId}'`,
      );
    }

    const [level, rack, chamber] = await Promise.all([
      LevelModel.findOne({ id: pos.levelId, isActive: true }, null, { session }).lean().exec(),
      RackModel.findOne({ id: pos.rackId, isActive: true }, null, { session }).lean().exec(),
      ChamberModel.findOne({ id: pos.chamberId, isActive: true }, null, { session }).lean().exec(),
    ]);

    if (!level) {
      throw new Error(`Parent Level for position '${pos.code}' is inactive or invalid`);
    }
    if (!rack) {
      throw new Error(`Parent Rack for position '${pos.code}' is inactive or invalid`);
    }
    if (!chamber) {
      throw new Error(`Parent Chamber for position '${pos.code}' is inactive or invalid`);
    }

    lockedPositions.set(item.positionId, {
      code: pos.code,
      capacityBags: pos.capacityBags,
      chamberId: pos.chamberId,
    });
  }

  return lockedPositions;
}

export async function validatePutAwayCapacity(
  facilityId: string,
  grnId: string,
  grnBags: number,
  items: Array<{ positionId: string; bags: number }>,
  lockedPositions: Map<string, LockedPositionMeta>,
  session: mongoose.ClientSession,
): Promise<number> {
  const grnAllocatedAgg = await InventoryTransactionModel.aggregate([
    { $match: { grnId, facilityId } },
    { $group: { _id: null, total: { $sum: '$quantity' } } },
  ]).session(session);

  const currentGrnAllocated = grnAllocatedAgg[0]?.total ?? 0;
  const remainingGrnUnallocated = grnBags - currentGrnAllocated;
  const totalRequestedBags = items.reduce((sum, item) => sum + item.bags, 0);

  if (totalRequestedBags > remainingGrnUnallocated) {
    throw new Error(
      `Requested ${totalRequestedBags} bags exceeds unallocated GRN balance of ${remainingGrnUnallocated} bags (received: ${grnBags}, allocated: ${currentGrnAllocated})`,
    );
  }

  for (const item of items) {
    const posMeta = lockedPositions.get(item.positionId)!;
    const posOccupancyAgg = await InventoryTransactionModel.aggregate([
      { $match: { positionId: item.positionId, facilityId } },
      {
        $group: {
          _id: null,
          total: {
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
    ]).session(session);

    const currentOccupancy = posOccupancyAgg[0]?.total ?? 0;
    const availableCapacity = posMeta.capacityBags - currentOccupancy;

    if (item.bags > availableCapacity) {
      throw new Error(
        `Requested ${item.bags} bags exceeds available capacity of ${availableCapacity} bags for position '${posMeta.code}' (capacity: ${posMeta.capacityBags}, occupied: ${currentOccupancy})`,
      );
    }
  }

  return totalRequestedBags;
}
