import { randomUUID } from 'node:crypto';
import { InventoryTransactionModel } from '../../database/models/inventory-transaction.model.js';

/**
 * Seeds the inward leg of the stock ledger for a GRN.
 *
 * Production writes this row inside the create-GRN transaction, so a fixture that skipped it would
 * model a state the application cannot produce: a receipt whose bags never entered the chamber.
 * That divergence is exactly what makes a ledger-summed balance disagree with the receipt, so the
 * fixture writes it and the tests exercise the real shape.
 *
 * Not idempotent: it always inserts. Repeated seeding of one GRN id would double its inward leg,
 * which is why callers pass a freshly generated grnId.
 */
export async function seedInwardPutAway(options: {
  facilityId: string;
  grnId: string;
  grnNumber: string;
  chamber: string;
  commodityId: string;
  bagType: 'S' | 'B' | 'S+B';
  smallBags: number;
  bigBags: number;
  createdAt?: Date;
  createdBy?: string;
}): Promise<string> {
  const id = `tx-${randomUUID()}`;

  await InventoryTransactionModel.create({
    id,
    facilityId: options.facilityId,
    grnId: options.grnId,
    grnNumber: options.grnNumber,
    chamber: options.chamber,
    commodityId: options.commodityId,
    bagType: options.bagType,
    transactionType: 'INWARD_PUTAWAY',
    smallQuantity: options.smallBags,
    bigQuantity: options.bigBags,
    referenceType: 'PUT_AWAY',
    referenceId: options.grnId,
    notes: null,
    createdBy: options.createdBy ?? 'usr-fixture',
    createdAt: options.createdAt ?? new Date(),
  });

  return id;
}