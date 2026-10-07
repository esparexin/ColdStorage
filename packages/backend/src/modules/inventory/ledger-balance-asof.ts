import type mongoose from 'mongoose';
import { InventoryTransactionModel } from '../../database/models/inventory-transaction.model.js';
import { ledgerSignedComposition } from './ledger-polarity.js';
import {
  EMPTY,
  toBalance,
  type LedgerBalance,
  type RawCompositionTotals,
} from './ledger-balance.js';

/**
 * Stock for one GRN as of an instant: only movements recorded strictly before
 * `asOf` contribute. Ledger rows carry the business date in `createdAt`, so a
 * month-start snapshot (e.g. Jan 01) is deterministic and independent of when
 * later dispatches happen. Same signed-composition SSOT as readLedgerBalance.
 */
export async function readLedgerBalanceAsOf(
  facilityId: string,
  grnId: string,
  asOf: Date,
  session?: mongoose.ClientSession,
): Promise<LedgerBalance> {
  const agg = await InventoryTransactionModel.aggregate<RawCompositionTotals>(
    [
      { $match: { facilityId, grnId, createdAt: { $lt: asOf } } },
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
  return toBalance(
    Math.max(0, Number(agg[0].small ?? 0)),
    Math.max(0, Number(agg[0].big ?? 0)),
  );
}
