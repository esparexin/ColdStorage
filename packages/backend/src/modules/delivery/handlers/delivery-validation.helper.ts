import type mongoose from 'mongoose';
import type { BagComposition } from '@cold-storage/contracts';
import { DeliveryChallanModel } from '../../../database/models/delivery-challan.model.js';
import { readLedgerBalance } from '../../inventory/ledger-balance.js';
import { validateOperationalDate } from '../../common/operational-date.helper.js';

export interface CompositionBalance extends BagComposition {
  total: number;
}

/**
 * Delivery withdrawal is validated against the ledger-derived balance for the GRN. Concurrency
 * is serialised by the caller bumping the GRN row inside the transaction.
 *
 * Final-delivery rule: only bags on final delivery challans (those bringing the
 * remaining balance to zero) determine the final delivered quantity for
 * delivery/settlement. GRN opening bags, intermediate/partial delivery bags,
 * rent months, and weight values are never treated as final delivery quantity.
 */
export async function validateStockAndBalances(
  facilityId: string,
  grn: { id: string; grnNumber: string; bagType?: string | null },
  withdrawal: BagComposition,
  session: mongoose.ClientSession,
  isHybrid?: boolean,
  requestedQuantity?: number | null,
): Promise<CompositionBalance> {
  const available = await readLedgerBalance(facilityId, grn.id, session);
  const remainingSmall = available.smallBags;
  const remainingBig = available.bigBags;
  const requestedTotal =
    isHybrid && typeof requestedQuantity === 'number' && requestedQuantity > 0
      ? requestedQuantity
      : withdrawal.smallBags + withdrawal.bigBags;

  if (requestedTotal > available.total) {
    if (isHybrid) {
      throw new Error(
        `Requested ${requestedTotal} bags exceeds the available balance of ${available.total} bags for GRN '${grn.grnNumber}'`,
      );
    }
    throw new Error(
      `Requested ${requestedTotal} bags exceeds the available balance of ${remainingSmall} small and ${remainingBig} big bags for GRN '${grn.grnNumber}'`,
    );
  }

  if (isHybrid) {
    const allocSmall = Math.min(requestedTotal, remainingSmall);
    const allocBig = requestedTotal - allocSmall;
    withdrawal.smallBags = allocSmall;
    withdrawal.bigBags = allocBig;
    return {
      smallBags: remainingSmall,
      bigBags: remainingBig,
      total: available.total,
    };
  }

  if (grn.bagType === 'S' && withdrawal.bigBags > 0) {
    throw new Error(
      `Requested ${withdrawal.bigBags} big bags exceeds available balance for single-type Small GRN '${grn.grnNumber}'`,
    );
  }

  if (grn.bagType === 'B' && withdrawal.smallBags > 0) {
    throw new Error(
      `Requested ${withdrawal.smallBags} small bags exceeds available balance for single-type Big GRN '${grn.grnNumber}'`,
    );
  }

  // When a GRN was historically split into distinct small and big pools (both > 0),
  // guard per type so individual balances are not exceeded.
  if (remainingSmall > 0 && remainingBig > 0) {
    if (withdrawal.smallBags > remainingSmall || withdrawal.bigBags > remainingBig) {
      throw new Error(
        `Requested ${withdrawal.smallBags} small and ${withdrawal.bigBags} big bags exceeds the ` +
          `available balance of ${remainingSmall} small and ${remainingBig} big bags for GRN '${grn.grnNumber}'`,
      );
    }
  }

  return {
    smallBags: remainingSmall,
    bigBags: remainingBig,
    total: available.total,
  };
}

export function validateDeliveryDate(
  inputDate?: string | Date,
  inwardDate?: string | Date,
): Date {
  const deliveryDate = validateOperationalDate(inputDate, { label: 'Delivery' });
  if (inwardDate) {
    const inDate = new Date(inwardDate);
    if (!Number.isNaN(inDate.getTime()) && deliveryDate.getTime() < inDate.getTime()) {
      throw new Error('Delivery date cannot be earlier than Inward date');
    }
  }
  return deliveryDate;
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

/** Stock currently on hand for a GRN inside a transaction, read from the ledger. */
export async function readAvailableBags(
  facilityId: string,
  grnId: string,
  session: mongoose.ClientSession,
): Promise<number> {
  const balance = await readLedgerBalance(facilityId, grnId, session);
  return balance.total;
}