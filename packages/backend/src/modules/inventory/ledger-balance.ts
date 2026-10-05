import type mongoose from 'mongoose';
import { InventoryTransactionModel } from '../../database/models/inventory-transaction.model.js';
import { ledgerSignedComposition } from './ledger-polarity.js';

/**
 * The single derivation of physical stock.
 * Every balance in the system is the signed sum of the immutable ledger for one GRN.
 * An inward put-away adds bags, an outward delivery removes them, and a reversal restores them.
 * Lives in `modules/inventory` because both delivery and rent modules read it without cross-importing.
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

/** Available stock for one GRN. `session` enables reading uncommitted balance inside transactions. */
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

/** Facility stock rolled up by a grouping dimension without clamping negative rows. */
export async function readLedgerGrouped(
  facilityId: string,
  groupBy: LedgerGroupBy,
  session?: mongoose.ClientSession,
): Promise<GroupedLedgerBalance[]> {
  const agg = await InventoryTransactionModel.aggregate<{ _id: string; small: number; big: number }>(
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

/** Facility stock rolled up by two dimensions at once for cross-tabulation. */
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

/** Net delivered bags for one GRN (outward delivery minus reversal). */
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

/** Net delivered bags for many GRNs in one batch aggregation for list views. */
export async function readLedgerNetDeliveredMany(
  facilityId: string,
  grnIds: string[],
  session?: mongoose.ClientSession,
): Promise<Map<string, LedgerBalance>> {
  if (grnIds.length === 0) return new Map();

  const agg = await InventoryTransactionModel.aggregate<{ _id: string; small: number; big: number }>(
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

/** Current ledger stock balance for many GRNs in one aggregation. */
export async function readLedgerBalanceMany(
  facilityId: string,
  grnIds: string[],
  session?: mongoose.ClientSession,
): Promise<Map<string, LedgerBalance>> {
  if (grnIds.length === 0) return new Map();

  const agg = await InventoryTransactionModel.aggregate<{ _id: string; small: number; big: number }>(
    [
      { $match: { facilityId, grnId: { $in: grnIds } } },
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
      toBalance(Math.max(0, Number(row.small ?? 0)), Math.max(0, Number(row.big ?? 0))),
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