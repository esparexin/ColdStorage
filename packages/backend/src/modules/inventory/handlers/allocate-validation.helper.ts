import type mongoose from 'mongoose';
import { InventoryTransactionModel } from '../../../database/models/inventory-transaction.model.js';
import {
  lockPositionsForUpdate,
  type LockedPositionMeta,
} from '../../common/position-lock.helper.js';

export type { LockedPositionMeta } from '../../common/position-lock.helper.js';

/**
 * Put-away additionally requires the position's parent Level, Rack and Chamber to be active,
 * because it writes stock into the hierarchy rather than withdrawing from it.
 */
export async function validateAndLockPutAwayPositions(
  facilityId: string,
  chamberId: string,
  items: Array<{ positionId: string; bags: number }>,
  session: mongoose.ClientSession,
): Promise<Map<string, LockedPositionMeta>> {
  return lockPositionsForUpdate(facilityId, chamberId, items, session, {
    verifyActiveParents: true,
  });
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
