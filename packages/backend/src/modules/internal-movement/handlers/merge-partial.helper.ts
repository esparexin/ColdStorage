import mongoose from 'mongoose';
import { randomUUID } from 'node:crypto';
import { GrnModel } from '../../../database/models/grn.model.js';
import { InventoryTransactionModel } from '../../../database/models/inventory-transaction.model.js';
import type { LedgerBalance } from '../../inventory/ledger-balance.js';

/** Quantity-aware partial deduction (M2): source keeps remainder OPEN, liability stays on source. */
export function resolvePartialMoveQty(bal: LedgerBalance, small: number, big: number): { small: number; big: number; total: number } {
  const s = Math.max(0, Math.floor(small));
  const b = Math.max(0, Math.floor(big));
  const total = s + b;
  if (total <= 0) throw new Error('Partial move must move at least one bag');
  if (total > bal.total) throw new Error(`Move of ${total} bags exceeds available ${bal.total} bags`);
  if (bal.smallBags > 0 && bal.bigBags > 0) {
    if (s > bal.smallBags || b > bal.bigBags) {
      throw new Error(`Move (${s} S + ${b} B) exceeds available (${bal.smallBags} S + ${bal.bigBags} B)`);
    }
  }
  return { small: s, big: b, total };
}

export async function applyPartialMergeDeduction(params: {
  facilityId: string; sourceId: string; sourceNumber: string; chamber: string; commodityId: string; bagType: string;
  moveSmall: number; moveBig: number; moveTotal: number; targetNumber: string; movementId: string;
  movementDate: Date; remarks: string; userId: string; session: mongoose.ClientSession;
}): Promise<void> {
  const p = params;
  await InventoryTransactionModel.create([{
    id: `tx-${randomUUID()}`, facilityId: p.facilityId, grnId: p.sourceId, grnNumber: p.sourceNumber,
    chamber: p.chamber, commodityId: p.commodityId, bagType: p.bagType, transactionType: 'OUTWARD_DELIVERY',
    smallQuantity: p.moveSmall, bigQuantity: p.moveBig, referenceType: 'DELIVERY',
    referenceId: `${p.movementId}-${p.sourceId}-partial`,
    notes: `Partial merge into GRN ${p.targetNumber}: ${p.remarks.trim()}`,
    createdBy: p.userId, createdAt: p.movementDate,
  }], { session: p.session, ordered: true });
  const moveDateStr = p.movementDate.toISOString().split('T')[0];
  const note = `[PARTIAL MERGE into GRN ${p.targetNumber} on ${moveDateStr}: ${p.moveTotal} bags moved. Liability retained on source unless explicit override. Reason: ${p.remarks.trim()}]`;
  await GrnModel.updateOne({ id: p.sourceId }, [{
    $set: {
      smallBags: { $subtract: ['$smallBags', p.moveSmall] },
      bigBags: { $subtract: ['$bigBags', p.moveBig] },
      bags: { $subtract: ['$bags', p.moveTotal] },
      remarks: { $concat: [{ $ifNull: ['$remarks', ''] }, '\n', note] },
      updatedAt: new Date(),
    },
  }], { session: p.session });
}
