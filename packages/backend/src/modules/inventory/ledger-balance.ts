import type mongoose from 'mongoose';
import { InventoryTransactionModel } from '../../database/models/inventory-transaction.model.js';
import { ledgerSignedComposition } from './ledger-polarity.js';

/**
 * The single derivation of physical stock.
 *
 * Every balance in the system is the signed sum of the immutable ledger for one GRN. There is no
 * put-away allocation, no persisted counter and no second formula: an inward put-away adds bags,
 * an outward delivery removes them, and a delivery reversal restores them, which is what
 * `ledgerSignedComposition` expresses.
 *
 * Lives in `modules/inventory` because both the delivery module and the rent module read it, and
 * neither may import another domain's internals.
 */

/** Available stock for one GRN, per bag type and in total. */
export interface LedgerBalance {
  smallBags: number;
  bigBags: number;
  total: number;
}

/** Stock rolled up across a facility by a grouping dimension. */
export interface GroupedLedgerBalance extends LedgerBalance {
  key: string;
}

interface RawCompositionTotals {
  _id: null;
  small: number;
  big: number;
}

function toBalance(small: number, big: number): LedgerBalance {
  return { smallBags: small, bigBags: big, total: small + big };
}

const EMPTY: LedgerBalance = { smallBags: 0, bigBags: 0, total: 0 };

/**
 * Available stock for one GRN.
 *
 * `session` lets a caller read the balance inside the same transaction that is about to mutate it,
 * which is how the delivery guard sees its own write rather than a stale committed figure.
 */
export async function readLedgerBalance(
  facilityId: string,
  grnId: string,
  session?: mongoose.ClientSession,
): Promise<LedgerBalance> {
  const agg = await InventoryTransactionModel.aggregate<RawCompositionTotals>(
    [
      { $match: { facilityId, grnId } },
      {
        $group: {
          _id: null,
          small: { $sum: ledgerSignedComposition.small },
          big: { $sum: ledgerSignedComposition.big },
        },
      },
    ],
    session ? { session } : {},
  );

  if (!agg[0]) return EMPTY;
  return toBalance(Number(agg[0].small ?? 0), Number(agg[0].big ?? 0));
}

export type LedgerGroupBy = 'commodityId' | 'chamber';

/**
 * Facility stock rolled up by a grouping dimension.
 *
 * Rows are returned with their sign applied and are not clamped, so a genuinely negative row is
 * visible to the caller rather than silently dropped — a facility must never report stock it does
 * not have, and hiding that would hide the divergence that caused it.
 */
export async function readLedgerGrouped(
  facilityId: string,
  groupBy: LedgerGroupBy,
  session?: mongoose.ClientSession,
): Promise<GroupedLedgerBalance[]> {
  const agg = await InventoryTransactionModel.aggregate<
    { _id: string; small: number; big: number }
  >(
    [
      { $match: { facilityId } },
      {
        $group: {
          _id: `$${groupBy}`,
          small: { $sum: ledgerSignedComposition.small },
          big: { $sum: ledgerSignedComposition.big },
        },
      },
    ],
    session ? { session } : {},
  );

  return agg.map((row) => ({
    key: String(row._id),
    ...toBalance(Number(row.small ?? 0), Number(row.big ?? 0)),
  }));
}

/** Stock rolled up by a commodity/chamber pair. */
export interface PairedLedgerBalance extends LedgerBalance {
  first: string;
  second: string;
}

/**
 * Facility stock rolled up by two dimensions at once, for views that cross-tabulate them.
 *
 * A separate helper rather than client-side joining of two single-dimension rollups, because
 * joining would silently drop pairs that net to zero on one side and misattribute the other.
 */
export async function readLedgerGroupedPairs(
  facilityId: string,
  first: 'commodityId' | 'chamber',
  second: 'commodityId' | 'chamber',
  session?: mongoose.ClientSession,
): Promise<PairedLedgerBalance[]> {
  const agg = await InventoryTransactionModel.aggregate<
    { _id: { first: string; second: string }; small: number; big: number }
  >(
    [
      { $match: { facilityId } },
      {
        $group: {
          _id: { first: `$${first}`, second: `$${second}` },
          small: { $sum: ledgerSignedComposition.small },
          big: { $sum: ledgerSignedComposition.big },
        },
      },
    ],
    session ? { session } : {},
  );

  return agg.map((row) => ({
    first: String(row._id.first),
    second: String(row._id.second),
    ...toBalance(Number(row.small ?? 0), Number(row.big ?? 0)),
  }));
}

/**
 * Net delivered bags for one GRN, per bag type and in total.
 *
 * Excludes the inward leg and applies `ledgerSignedComposition`, so an outward movement is
 * negative and a reversal is positive — this is the complement of the inward row, not a
 * re-derivation of the balance. The rent receipt print and the settlement figures both need it.
 */
export async function readLedgerNetDelivered(
  facilityId: string,
  grnId: string,
  session?: mongoose.ClientSession,
): Promise<LedgerBalance> {
  const agg = await InventoryTransactionModel.aggregate<RawCompositionTotals>(
    [
      {
        $match: {
          facilityId,
          grnId,
          transactionType: { $in: ['OUTWARD_DELIVERY', 'DELIVERY_REVERSAL'] },
        },
      },
      {
        $group: {
          _id: null,
          small: { $sum: ledgerSignedComposition.small },
          big: { $sum: ledgerSignedComposition.big },
        },
      },
    ],
    session ? { session } : {},
  );

  if (!agg[0]) return EMPTY;
  const small = Number(agg[0].small ?? 0);
  const big = Number(agg[0].big ?? 0);
  return toBalance(Math.abs(small), Math.abs(big));
}

/**
 * Net delivered bags for many GRNs in one round trip, for list views.
 *
 * One aggregation rather than one call per GRN: the list endpoint already pages the receipts,
 * and N+1 balance reads would multiply its latency by the page size.
 */
export async function readLedgerNetDeliveredMany(
  facilityId: string,
  grnIds: string[],
  session?: mongoose.ClientSession,
): Promise<Map<string, LedgerBalance>> {
  if (grnIds.length === 0) return new Map();

  const agg = await InventoryTransactionModel.aggregate<
    { _id: string; small: number; big: number }
  >(
    [
      {
        $match: {
          facilityId,
          grnId: { $in: grnIds },
          transactionType: { $in: ['OUTWARD_DELIVERY', 'DELIVERY_REVERSAL'] },
        },
      },
      {
        $group: {
          _id: '$grnId',
          small: { $sum: ledgerSignedComposition.small },
          big: { $sum: ledgerSignedComposition.big },
        },
      },
    ],
    session ? { session } : {},
  );

  return new Map(
    agg.map((row) => [
      String(row._id),
      toBalance(Math.abs(Number(row.small ?? 0)), Math.abs(Number(row.big ?? 0))),
    ]),
  );
}

/** The inward leg alone: what the GRN put into the chamber, per bag type. */
export async function readLedgerInward(
  facilityId: string,
  grnId: string,
  session?: mongoose.ClientSession,
): Promise<LedgerBalance> {
  const agg = await InventoryTransactionModel.aggregate<RawCompositionTotals>(
    [
      { $match: { facilityId, grnId, transactionType: 'INWARD_PUTAWAY' } },
      {
        $group: {
          _id: null,
          small: { $sum: ledgerSignedComposition.small },
          big: { $sum: ledgerSignedComposition.big },
        },
      },
    ],
    session ? { session } : {},
  );

  if (!agg[0]) return EMPTY;
  return toBalance(Number(agg[0].small ?? 0), Number(agg[0].big ?? 0));
}