import type mongoose from 'mongoose';
import { allocateHybridSplit, type BagComposition } from '@cold-storage/contracts';
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
  grn: { id: string; grnNumber: string; bagType?: string | null; isCompositionVerified?: boolean | null },
  withdrawal: BagComposition,
  session: mongoose.ClientSession,
  isHybrid?: boolean,
  requestedQuantity?: number | null,
  hasSpecificBags?: boolean,
): Promise<CompositionBalance> {
  const available = await readLedgerBalance(facilityId, grn.id, session);
  const remainingSmall = available.smallBags;
  const remainingBig = available.bigBags;
  const requestedTotal =
    isHybrid && typeof requestedQuantity === 'number' && requestedQuantity > 0 && !hasSpecificBags
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
    if (hasSpecificBags) {
      if (withdrawal.smallBags > remainingSmall || withdrawal.bigBags > remainingBig) {
        throw new Error(
          `Requested ${withdrawal.smallBags} small and ${withdrawal.bigBags} big bags exceeds the ` +
            `available balance of ${remainingSmall} small and ${remainingBig} big bags for GRN '${grn.grnNumber}'`,
        );
      }
    } else {
      const split = allocateHybridSplit(remainingSmall, remainingBig, requestedTotal);
      withdrawal.smallBags = split.smallBags;
      withdrawal.bigBags = split.bigBags;
    }
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

  // When a lot has verified composition or distinct pools (both > 0), enforce per-type pool limits
  const isSegregated = remainingSmall > 0 && remainingBig > 0;
  const isVerifiedSplit = grn.bagType === 'S+B' || Boolean(grn.isCompositionVerified);
  if (isSegregated || isVerifiedSplit) {
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

/**
 * Resolves ledger transaction quantities for S/B lots. Exact reconciliation:
 * each requested side must fit its own available pool — cross-pool
 * reallocation is rejected so the challan and the ledger can never disagree.
 */
export function resolveSafeLedgerDrawdown(
  isHybrid: boolean,
  bagType: string | undefined | null,
  finalSmall: number,
  finalBig: number,
  available: { smallBags: number; bigBags: number },
  hasUnclassifiedGenesis = false,
): { smallQuantity: number; bigQuantity: number } {
  if (isHybrid || (bagType !== 'S/B' && bagType !== 'S+B')) {
    return { smallQuantity: finalSmall, bigQuantity: finalBig };
  }
  const availSmall = Math.max(0, available.smallBags);
  const availBig = Math.max(0, available.bigBags);
  const requestedTotal = finalSmall + finalBig;
  const availableTotal = availSmall + availBig;

  if (requestedTotal > availableTotal) {
    throw new Error(
      `Requested ${requestedTotal} bags exceeds available stock of ${availableTotal} bags`,
    );
  }

  if (hasUnclassifiedGenesis) {
    if (finalSmall <= availSmall && finalBig <= availBig) {
      return { smallQuantity: finalSmall, bigQuantity: finalBig };
    }
    let drawSmall = Math.min(availSmall, finalSmall);
    let drawBig = Math.min(availBig, finalBig);
    const deficit = requestedTotal - (drawSmall + drawBig);
    if (deficit > 0) {
      const extraSmall = Math.min(availSmall - drawSmall, deficit);
      drawSmall += extraSmall;
      const remainingDeficit = deficit - extraSmall;
      drawBig += Math.min(availBig - drawBig, remainingDeficit);
    }
    return { smallQuantity: drawSmall, bigQuantity: drawBig };
  }

  const isSegregated = availSmall > 0 && availBig > 0;

  if (isSegregated) {
    if (finalSmall > availSmall || finalBig > availBig) {
      throw new Error(
        `Requested ${finalSmall} small and ${finalBig} big bags exceeds the available pools of ` +
          `${availSmall} small and ${availBig} big bags; small and big counts must reconcile exactly`,
      );
    }
    return { smallQuantity: finalSmall, bigQuantity: finalBig };
  }

  const drawSmall = Math.min(availSmall, requestedTotal);
  const drawBig = requestedTotal - drawSmall;
  return { smallQuantity: drawSmall, bigQuantity: drawBig };
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


/** Stock currently on hand for a GRN inside a transaction, read from the ledger. */
export async function readAvailableBags(
  facilityId: string,
  grnId: string,
  session: mongoose.ClientSession,
): Promise<number> {
  const balance = await readLedgerBalance(facilityId, grnId, session);
  return balance.total;
}