import mongoose from 'mongoose';
import { randomUUID } from 'node:crypto';
import { buildInwardReceiptNumber, getFinancialYearKey, grnNumberInputSchema } from '@cold-storage/contracts';
import type { Grn, InternalMovementRecord, TransferOwnershipInput } from '@cold-storage/contracts';
import { GrnModel } from '../../../database/models/grn.model.js';
import { InternalMovementModel } from '../../../database/models/internal-movement.model.js';
import { InventoryTransactionModel } from '../../../database/models/inventory-transaction.model.js';
import { CustomerModel } from '../../../database/models/customer.model.js';
import type { LedgerBalance } from '../../inventory/ledger-balance.js';
import { readLedgerBalance } from '../../inventory/ledger-balance.js';
import { withMongoRetry } from '../../common/mongo-retry.helper.js';
import { auditService } from '../../audit/audit.service.js';
import { toGrnEntity } from '../../grn/grn.mappers.js';

/** Partial ownership split (M2): source retains remainder OPEN with full liability; new GRN takes moved bags. */
export function resolvePartialTransferQty(bal: LedgerBalance, small: number, big: number): { small: number; big: number; total: number } {
  const s = Math.max(0, Math.floor(small ?? 0));
  const b = Math.max(0, Math.floor(big ?? 0));
  const total = s + b;
  if (total <= 0) throw new Error('Partial transfer must move at least one bag');
  if (total >= bal.total) throw new Error('Partial transfer must leave bags with the original owner; use full transfer otherwise');
  if (bal.smallBags > 0 && bal.bigBags > 0 && (s > bal.smallBags || b > bal.bigBags)) {
    throw new Error(`Transfer (${s} S + ${b} B) exceeds available (${bal.smallBags} S + ${bal.bigBags} B)`);
  }
  return { small: s, big: b, total };
}

export async function applyPartialTransferSplit(params: {
  facilityId: string; source: Record<string, unknown>; bal: LedgerBalance;
  moveSmall: number; moveBig: number; moveTotal: number; newGrnNumber: string;
  newCustomer: Record<string, unknown>; movementId: string; movementDate: Date;
  remarks: string; userId: string; session: mongoose.ClientSession;
}): Promise<string> {
  const p = params;
  const src = p.source;
  const existing = await GrnModel.findOne({ facilityId: p.facilityId, grnNumber: p.newGrnNumber }, null, { session: p.session }).lean().exec();
  if (existing) throw new Error(`GRN '${p.newGrnNumber}' already exists for this facility.`);
  const inwardDate = new Date(String((src.date as Date) ?? new Date()));
  const fy = getFinancialYearKey(inwardDate);
  const newId = `grn-${randomUUID()}`;
  await GrnModel.create([{
    id: newId, facilityId: p.facilityId, grnNumber: p.newGrnNumber,
    inwardReceiptNumber: buildInwardReceiptNumber(fy, p.newGrnNumber), date: inwardDate,
    customerId: String(p.newCustomer.id), customerName: String(p.newCustomer.name),
    commodityId: String(src.commodityId), commodityName: String(src.commodityName),
    chamber: String(src.chamber), bags: p.moveTotal, bagType: String(src.bagType ?? 'S/B'),
    smallBags: p.moveSmall, bigBags: p.moveBig, isCompositionVerified: true,
    rentType: String(src.rentType), rentMonths: (src.rentMonths as number | null) ?? null, rentAmount: 0,
    bagPrice: (src.bagPrice as number | null) ?? null,
    smallBagPrice: (src.smallBagPrice as number | null) ?? null,
    bigBagPrice: (src.bigBagPrice as number | null) ?? null,
    hamaliRate: 0, hamaliAmount: 0, status: 'OPEN', isBondForLoan: false, loanStatus: 'NONE',
    remarks: `Split from GRN ${String(src.grnNumber)} on ${p.movementDate.toISOString().split('T')[0]}: ${p.remarks.trim()}`,
    createdBy: p.userId,
  }], { session: p.session, ordered: true });
  await InventoryTransactionModel.create([
    {
      id: `tx-${randomUUID()}`, facilityId: p.facilityId, grnId: String(src.id), grnNumber: String(src.grnNumber),
      chamber: String(src.chamber), commodityId: String(src.commodityId), bagType: String(src.bagType ?? 'S/B'),
      transactionType: 'OUTWARD_DELIVERY', smallQuantity: p.moveSmall, bigQuantity: p.moveBig,
      referenceType: 'DELIVERY', referenceId: `${p.movementId}-split-out`,
      notes: `Partial transfer to ${String(p.newCustomer.name)} (${p.newGrnNumber})`, createdBy: p.userId, createdAt: p.movementDate,
    },
    {
      id: `tx-${randomUUID()}`, facilityId: p.facilityId, grnId: newId, grnNumber: p.newGrnNumber,
      chamber: String(src.chamber), commodityId: String(src.commodityId), bagType: String(src.bagType ?? 'S/B'),
      transactionType: 'INWARD_PUTAWAY', smallQuantity: p.moveSmall, bigQuantity: p.moveBig,
      referenceType: 'PUT_AWAY', referenceId: newId, notes: `Split receipt from GRN ${String(src.grnNumber)}`,
      createdBy: p.userId, createdAt: inwardDate,
    },
  ], { session: p.session, ordered: true });
  await GrnModel.updateOne({ id: String(src.id) }, [{
    $set: {
      remarks: { $concat: [{ $ifNull: ['$remarks', ''] }, '\n', `Split to GRN ${p.newGrnNumber} on ${p.movementDate.toISOString().split('T')[0]}: ${p.moveTotal} bags (${p.moveSmall} S + ${p.moveBig} B) moved via ledger. Receipt quantities preserved; balance is ledger-derived. ${p.remarks.trim()}`] },
      updatedAt: new Date(),
    },
  }], { session: p.session });
  return newId;
}

/** Full partial-transfer flow (M2): split GRN, liability retained on source, new GRN rent 0. */
export async function executePartialTransfer(facilityId: string, input: TransferOwnershipInput, userId: string): Promise<{ grn: Grn; movement: InternalMovementRecord }> {
  const small = input.transferSmallBags ?? 0;
  const big = input.transferBigBags ?? 0;
  if (!input.newGrnNumber?.trim()) throw new Error('Partial transfer requires newGrnNumber for the split GRN');
  const parsed = grnNumberInputSchema.safeParse(input.newGrnNumber.trim());
  if (!parsed.success) throw new Error('newGrnNumber must be exactly 4 digits');
  if (input.paymentDecision === 'SETTLE_NOW') throw new Error('Partial transfer cannot settle now: liability is retained on the source; settle separately');
  const session = await mongoose.startSession();
  let newId = '';
  try {
    await withMongoRetry(() => session.withTransaction(async () => {
      const grn = await GrnModel.findOne({ id: input.grnId, facilityId }, null, { session }).lean().exec();
      if (!grn) throw new Error(`GRN '${input.grnId}' not found in facility '${facilityId}'`);
      if (grn.status === 'CLOSED') throw new Error(`Cannot transfer ownership of CLOSED GRN '${grn.grnNumber}'`);
      if (grn.loanStatus === 'TAKEN') throw new Error(`Cannot transfer ownership: Active loan hold against GRN '${grn.grnNumber}'`);
      const newCustomer = await CustomerModel.findOne({ id: input.newCustomerId }, null, { session }).lean().exec();
      if (!newCustomer || !newCustomer.isActive || !newCustomer.facilityIds.includes(facilityId)) {
        throw new Error(`New customer '${input.newCustomerId}' is not available in this facility`);
      }
      const bal = await readLedgerBalance(facilityId, grn.id, session);
      const qty = resolvePartialTransferQty(bal, small, big);
      const movementId = `mov-${randomUUID()}`;
      const movementDate = new Date(input.movementDate);
      newId = await applyPartialTransferSplit({
        facilityId, source: grn as unknown as Record<string, unknown>, bal,
        moveSmall: qty.small, moveBig: qty.big, moveTotal: qty.total, newGrnNumber: parsed.data,
        newCustomer: newCustomer as unknown as Record<string, unknown>,
        movementId, movementDate, remarks: input.remarks, userId, session,
      });
      await InternalMovementModel.create([{
        id: movementId, facilityId, movementType: 'TRANSFER_OWNERSHIP', movementDate: input.movementDate,
        grnId: grn.id, grnNumber: grn.grnNumber, fromCustomerId: grn.customerId, fromCustomerName: grn.customerName,
        toCustomerId: newCustomer.id, toCustomerName: newCustomer.name,
        totalBagsMoved: qty.total, smallBagsMoved: qty.small, bigBagsMoved: qty.big,
        targetGrnId: newId, targetGrnNumber: parsed.data,
        financialSnapshot: { rentAmount: grn.rentAmount ?? 0, totalPaid: 0, remainingBalance: grn.rentAmount ?? 0, paymentStatus: 'Not Settled' },
        remarks: `Partial transfer: ${qty.total} bags to ${parsed.data}; liability retained on source. ${input.remarks.trim()}`,
        performedBy: userId, createdAt: new Date(),
      }], { session, ordered: true });
    }));
  } finally {
    await session.endSession();
  }
  const [sourceDoc, moveDoc] = await Promise.all([
    GrnModel.findOne({ id: input.grnId }).lean().exec(),
    InternalMovementModel.findOne({ targetGrnId: newId }).lean().exec(),
  ]);
  await auditService.log({
    eventType: 'INTERNAL_MOVEMENT_TRANSFER', severity: 'INFO', userId, facilityId, resource: 'grn', resourceId: input.grnId,
    details: { grnNumber: sourceDoc?.grnNumber, newGrnNumber: parsed.data, partial: true, remarks: input.remarks },
  });
  return {
    grn: toGrnEntity(sourceDoc as never),
    movement: moveDoc as unknown as InternalMovementRecord,
  };
}
