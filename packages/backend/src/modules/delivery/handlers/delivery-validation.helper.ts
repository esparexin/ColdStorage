import type mongoose from 'mongoose';
import type { CreateDeliveryInput } from '@cold-storage/contracts';
import { InventoryTransactionModel } from '../../../database/models/inventory-transaction.model.js';
import { validateOperationalDate } from '../../common/operational-date.helper.js';
import {
  lockPositionsForUpdate,
  type LockedPositionMeta,
} from '../../common/position-lock.helper.js';

export type { LockedPositionMeta } from '../../common/position-lock.helper.js';

/**
 * Delivery withdrawal locks the target positions in ascending order so concurrent
 * transactions cannot deadlock. Full ancestry verification is not required here: capacity is
 * re-checked against the ledger, not against the hierarchy.
 */
export async function validateAndLockPositions(
  facilityId: string,
  chamberId: string,
  items: CreateDeliveryInput['items'],
  session: mongoose.ClientSession,
): Promise<Map<string, LockedPositionMeta>> {
  return lockPositionsForUpdate(facilityId, chamberId, items, session);
}

export async function validateStockAndBalances(
  facilityId: string,
  grn: { id: string; grnNumber: string; bags: number },
  items: CreateDeliveryInput['items'],
  lockedPositions: Map<string, LockedPositionMeta>,
  session: mongoose.ClientSession,
): Promise<{ remainingDeliveryBalance: number; physicallyStored: number; totalRequestedBags: number }> {
  const [outwardAgg, reversalAgg, inwardAgg] = await Promise.all([
    InventoryTransactionModel.aggregate([
      { $match: { grnId: grn.id, facilityId, transactionType: 'OUTWARD_DELIVERY' } },
      { $group: { _id: null, total: { $sum: '$quantity' } } },
    ]).session(session),
    InventoryTransactionModel.aggregate([
      { $match: { grnId: grn.id, facilityId, transactionType: 'DELIVERY_REVERSAL' } },
      { $group: { _id: null, total: { $sum: '$quantity' } } },
    ]).session(session),
    InventoryTransactionModel.aggregate([
      { $match: { grnId: grn.id, facilityId, transactionType: 'INWARD_PUTAWAY' } },
      { $group: { _id: null, total: { $sum: '$quantity' } } },
    ]).session(session),
  ]);

  const totalOutward = outwardAgg[0]?.total ?? 0;
  const totalReversal = reversalAgg[0]?.total ?? 0;
  const totalInward = inwardAgg[0]?.total ?? 0;

  const netDelivered = totalOutward - totalReversal;
  const remainingDeliveryBalance = grn.bags - netDelivered;
  const physicallyStored = totalInward - totalOutward + totalReversal;

  const totalRequestedBags = items.reduce((sum, item) => sum + item.bags, 0);

  if (totalRequestedBags > remainingDeliveryBalance) {
    throw new Error(
      `Requested ${totalRequestedBags} bags exceeds remaining delivery balance of ${remainingDeliveryBalance} bags for GRN '${grn.grnNumber}'`,
    );
  }

  if (totalRequestedBags > physicallyStored) {
    throw new Error(
      `Requested ${totalRequestedBags} bags exceeds physically available stock of ${physicallyStored} bags for GRN '${grn.grnNumber}' (unallocated bags cannot be delivered)`,
    );
  }

  for (const item of items) {
    const posMeta = lockedPositions.get(item.positionId)!;
    const posStockAgg = await InventoryTransactionModel.aggregate([
      { $match: { grnId: grn.id, positionId: item.positionId, facilityId } },
      {
        $group: {
          _id: null,
          inward: {
            $sum: {
              $cond: [{ $eq: ['$transactionType', 'INWARD_PUTAWAY'] }, '$quantity', 0],
            },
          },
          outward: {
            $sum: {
              $cond: [{ $eq: ['$transactionType', 'OUTWARD_DELIVERY'] }, '$quantity', 0],
            },
          },
          reversal: {
            $sum: {
              $cond: [{ $eq: ['$transactionType', 'DELIVERY_REVERSAL'] }, '$quantity', 0],
            },
          },
        },
      },
    ]).session(session);

    const currentPosStock =
      (posStockAgg[0]?.inward ?? 0) -
      (posStockAgg[0]?.outward ?? 0) +
      (posStockAgg[0]?.reversal ?? 0);

    if (item.bags > currentPosStock) {
      throw new Error(
        `Requested ${item.bags} bags exceeds available stock of ${currentPosStock} bags in position '${posMeta.code}' for GRN '${grn.grnNumber}'`,
      );
    }
  }

  return { remainingDeliveryBalance, physicallyStored, totalRequestedBags };
}

export function validateDeliveryDate(inputDate?: string | Date): Date {
  return validateOperationalDate(inputDate, { label: 'Delivery' });
}

export async function validateReversalPositionsAndCapacity(
  facilityId: string,
  items: Array<{ positionId: string; bags: number }>,
  session: mongoose.ClientSession,
): Promise<Map<string, LockedPositionMeta>> {
  const lockedPositions = await lockPositionsForUpdate(facilityId, undefined, items, session);

  for (const item of items) {
    const posMeta = lockedPositions.get(item.positionId)!;
    const posOccupancyAgg = await InventoryTransactionModel.aggregate([
      { $match: { positionId: item.positionId, facilityId } },
      {
        $group: {
          _id: null,
          inward: {
            $sum: {
              $cond: [{ $eq: ['$transactionType', 'INWARD_PUTAWAY'] }, '$quantity', 0],
            },
          },
          outward: {
            $sum: {
              $cond: [{ $eq: ['$transactionType', 'OUTWARD_DELIVERY'] }, '$quantity', 0],
            },
          },
          reversal: {
            $sum: {
              $cond: [{ $eq: ['$transactionType', 'DELIVERY_REVERSAL'] }, '$quantity', 0],
            },
          },
        },
      },
    ]).session(session);

    const currentOccupancy =
      (posOccupancyAgg[0]?.inward ?? 0) -
      (posOccupancyAgg[0]?.outward ?? 0) +
      (posOccupancyAgg[0]?.reversal ?? 0);
    const availableCapacity = posMeta.capacityBags - currentOccupancy;

    if (item.bags > availableCapacity) {
      throw new Error(
        `Cannot reverse delivery: returning ${item.bags} bags exceeds available capacity of ${availableCapacity} bags in position '${posMeta.code}' (capacity: ${posMeta.capacityBags}, current occupancy: ${currentOccupancy})`,
      );
    }
  }

  return lockedPositions;
}
