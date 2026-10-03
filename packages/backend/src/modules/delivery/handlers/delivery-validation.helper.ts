import type mongoose from 'mongoose';
import type { CreateDeliveryInput } from '@cold-storage/contracts';
import { InventoryTransactionModel } from '../../../database/models/inventory-transaction.model.js';
import { validateOperationalDate } from '../../common/operational-date.helper.js';
import { ledgerSignedQuantity } from '../../inventory/ledger-polarity.js';

/**
 * Delivery withdrawal is validated against the GRN's ledger-derived stock, not against any
 * storage position. Concurrency is serialised by the caller bumping the GRN row inside the
 * transaction (the same mechanism put-away uses), so there is nothing to lock by position.
 */
export async function validateStockAndBalances(
  facilityId: string,
  grn: { id: string; grnNumber: string; bags: number },
  bags: CreateDeliveryInput['bags'],
  session: mongoose.ClientSession,
): Promise<{ remainingDeliveryBalance: number; physicallyStored: number }> {
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

  if (bags > remainingDeliveryBalance) {
    throw new Error(
      `Requested ${bags} bags exceeds remaining delivery balance of ${remainingDeliveryBalance} bags for GRN '${grn.grnNumber}'`,
    );
  }

  if (bags > physicallyStored) {
    throw new Error(
      `Requested ${bags} bags exceeds physically available stock of ${physicallyStored} bags for GRN '${grn.grnNumber}' (unallocated bags cannot be delivered)`,
    );
  }

  return { remainingDeliveryBalance, physicallyStored };
}

export function validateDeliveryDate(inputDate?: string | Date): Date {
  return validateOperationalDate(inputDate, { label: 'Delivery' });
}

/**
 * A reversal returns bags to the GRN's own stock. There is no capacity ceiling to check, so
 * the guard is simply that the reversal does not exceed the bags originally delivered on the
 * challan being reversed.
 */
export async function validateReversalBags(
  facilityId: string,
  deliveryId: string,
  bags: number,
  session: mongoose.ClientSession,
): Promise<{ remainingOnChallan: number }> {
  const agg = await InventoryTransactionModel.aggregate([
    { $match: { facilityId, referenceId: deliveryId, transactionType: 'OUTWARD_DELIVERY' } },
    {
      $group: {
        _id: null,
        delivered: { $sum: '$quantity' },
        reversed: {
          $sum: {
            $cond: [{ $eq: ['$transactionType', 'DELIVERY_REVERSAL'] }, '$quantity', 0],
          },
        },
      },
    },
  ]).session(session);

  const remainingOnChallan = (agg[0]?.delivered ?? 0) - (agg[0]?.reversed ?? 0);

  if (bags > remainingOnChallan) {
    throw new Error(
      `Cannot reverse ${bags} bags: only ${remainingOnChallan} bags remain delivered on this challan`,
    );
  }

  return { remainingOnChallan };
}

/** Ledger-derived stock currently on hand for a GRN inside a transaction. */
export async function readAvailableBags(
  facilityId: string,
  grnId: string,
  session: mongoose.ClientSession,
): Promise<number> {
  const agg = await InventoryTransactionModel.aggregate(
    [
      { $match: { facilityId, grnId } },
      { $group: { _id: null, bags: { $sum: ledgerSignedQuantity } } },
    ],
    { session },
  );
  return Math.max(0, agg[0]?.bags ?? 0);
}