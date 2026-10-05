import type mongoose from 'mongoose';
import type { BagComposition } from '@cold-storage/contracts';
import { DeliveryChallanModel } from '../../../database/models/delivery-challan.model.js';
import { GrnModel } from '../../../database/models/grn.model.js';
import { validateOperationalDate } from '../../common/operational-date.helper.js';

export interface CompositionBalance extends BagComposition {
  total: number;
}

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
  grn: BagComposition & { id: string; grnNumber: string },
  withdrawal: BagComposition,
  session: mongoose.ClientSession,
): Promise<CompositionBalance> {
  const issuedAgg = await DeliveryChallanModel.aggregate([
    { $match: { grnId: grn.id, facilityId, status: 'ISSUED' } },
    {
      $group: {
        _id: null,
        small: { $sum: '$smallBags' },
        big: { $sum: '$bigBags' },
      },
    },
  ]).session(session);

  const remainingSmall = grn.smallBags - (issuedAgg[0]?.small ?? 0);
  const remainingBig = grn.bigBags - (issuedAgg[0]?.big ?? 0);

  // The per-type balance is the guard that matters: a GRN holding 100 small and 100 big bags
  // must not permit a withdrawal of 150 big bags merely because the combined total would allow it.
  if (withdrawal.smallBags > remainingSmall || withdrawal.bigBags > remainingBig) {
    throw new Error(
      `Requested ${withdrawal.smallBags} small and ${withdrawal.bigBags} big bags exceeds the ` +
        `available balance of ${remainingSmall} small and ${remainingBig} big bags for GRN '${grn.grnNumber}'`,
    );
  }

  return {
    smallBags: remainingSmall,
    bigBags: remainingBig,
    total: Math.max(0, remainingSmall + remainingBig),
  };
}

export function validateDeliveryDate(inputDate?: string | Date): Date {
  return validateOperationalDate(inputDate, { label: 'Delivery' });
}

/**
 * A reversal is whole-challan only: the P0 lock parks partial reversal rules as unapproved, and
 * the reversal ledger row restores exactly the composition the challan dispatched. This is a
 * status check, not a quantity negotiation.
 */
export async function assertChallanIsReversible(
  facilityId: string,
  deliveryId: string,
  session: mongoose.ClientSession,
): Promise<void> {
  const challan = await DeliveryChallanModel.findOne({ id: deliveryId, facilityId })
    .session(session)
    .lean()
    .exec();

  if (!challan) {
    throw new Error(`Delivery challan '${deliveryId}' not found in facility '${facilityId}'`);
  }
  if (challan.status !== 'ISSUED') {
    throw new Error(`Delivery challan '${challan.challanNumber}' is already REVERSED`);
  }
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
      { $group: { _id: null, bags: { $sum: { $add: ['$smallBags', '$bigBags'] } } } },
    ],
    { session },
  );

  const netDelivered = issuedAgg[0]?.bags ?? 0;
  return Math.max(0, grn.bags - netDelivered);
}