import type mongoose from 'mongoose';
import type { CreateDeliveryInput } from '@cold-storage/contracts';
import { DeliveryChallanModel } from '../../../database/models/delivery-challan.model.js';
import { GrnModel } from '../../../database/models/grn.model.js';
import { validateOperationalDate } from '../../common/operational-date.helper.js';

/**
 * Delivery withdrawal is validated against the GRN's active delivery challans, not against any
 * separate stock transaction ledger. Concurrency is serialised by the caller bumping the GRN row inside the
 * transaction.
 *
 * Final-delivery rule: only bags on final delivery challans (those bringing the
 * remaining balance to zero) determine the final delivered quantity for
 * delivery/settlement. GRN opening bags, intermediate/partial delivery bags,
 * rent months, and weight values are never treated as final delivery quantity.
 */
export async function validateStockAndBalances(
  facilityId: string,
  grn: { id: string; grnNumber: string; bags: number },
  bags: CreateDeliveryInput['bags'],
  session: mongoose.ClientSession,
): Promise<{ remainingDeliveryBalance: number; physicallyStored: number }> {
  const issuedAgg = await DeliveryChallanModel.aggregate([
    { $match: { grnId: grn.id, facilityId, status: 'ISSUED' } },
    { $group: { _id: null, total: { $sum: '$bags' } } },
  ]).session(session);

  const netDelivered = issuedAgg[0]?.total ?? 0;
  const remainingDeliveryBalance = grn.bags - netDelivered;
  const physicallyStored = remainingDeliveryBalance;

  if (bags > remainingDeliveryBalance) {
    throw new Error(
      `Requested ${bags} bags exceeds remaining delivery balance of ${remainingDeliveryBalance} bags for GRN '${grn.grnNumber}'`,
    );
  }

  return { remainingDeliveryBalance, physicallyStored };
}

export function validateDeliveryDate(inputDate?: string | Date): Date {
  return validateOperationalDate(inputDate, { label: 'Delivery' });
}

/**
 * A reversal returns bags to the GRN's own stock. Validated directly against the
 * delivery challan's issued status and original bags.
 */
export async function validateReversalBags(
  facilityId: string,
  deliveryId: string,
  bags: number,
  session: mongoose.ClientSession,
): Promise<{ remainingOnChallan: number }> {
  const challan = await DeliveryChallanModel.findOne({ id: deliveryId, facilityId })
    .session(session)
    .lean()
    .exec();

  const remainingOnChallan = challan && challan.status === 'ISSUED' ? challan.bags : 0;

  if (bags > remainingOnChallan) {
    throw new Error(
      `Cannot reverse ${bags} bags: only ${remainingOnChallan} bags remain delivered on this challan`,
    );
  }

  return { remainingOnChallan };
}

/** Stock currently on hand for a GRN inside a transaction, derived from GRN bags minus active challans. */
export async function readAvailableBags(
  facilityId: string,
  grnId: string,
  session: mongoose.ClientSession,
): Promise<number> {
  const grn = await GrnModel.findOne({ id: grnId, facilityId }, { bags: 1 })
    .session(session)
    .lean()
    .exec();
  if (!grn) return 0;

  const issuedAgg = await DeliveryChallanModel.aggregate(
    [
      { $match: { facilityId, grnId, status: 'ISSUED' } },
      { $group: { _id: null, bags: { $sum: '$bags' } } },
    ],
    { session },
  );

  const netDelivered = issuedAgg[0]?.bags ?? 0;
  return Math.max(0, grn.bags - netDelivered);
}