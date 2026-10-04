import { randomUUID } from 'node:crypto';
import type {
  BagType,
  InventoryReferenceType,
  InventoryTransactionType,
} from '@cold-storage/contracts';
import { InventoryTransactionModel } from '../../database/models/inventory-transaction.model.js';

/**
 * Shared inventory-ledger fixtures.
 *
 * Physical stock is derived from the immutable ledger alone — there is no storage structure and
 * no persisted counter to read. Any assertion about stock, chamber grouping or monthly windows
 * must therefore be built on seeded ledger entries rather than on chamber/position master data.
 */

export interface SeedLedgerOptions {
  facilityId: string;
  grnId?: string;
  grnNumber?: string;
  /** Free-text chamber label copied from the owning GRN; never resolved against an entity. */
  chamber?: string;
  customerId?: string;
  commodityId?: string;
  bagType?: BagType;
  transactionType?: InventoryTransactionType;
  /** Bag composition of the movement. Defaults to a small-bag-only movement. */
  smallQuantity?: number;
  bigQuantity?: number;
  referenceId?: string;
  createdAt?: Date;
}

const REFERENCE_BY_TYPE: Record<InventoryTransactionType, InventoryReferenceType> = {
  INWARD_PUTAWAY: 'PUT_AWAY',
  OUTWARD_DELIVERY: 'DELIVERY',
  DELIVERY_REVERSAL: 'DELIVERY_REVERSAL',
};

export async function seedLedgerEntry(options: SeedLedgerOptions): Promise<string> {
  const id = `txn-${randomUUID()}`;
  const transactionType = options.transactionType ?? 'INWARD_PUTAWAY';

  await InventoryTransactionModel.create({
    id,
    facilityId: options.facilityId,
    grnId: options.grnId ?? `grn-${randomUUID()}`,
    grnNumber: options.grnNumber ?? 'GRN-FIXTURE-001',
    chamber: options.chamber ?? 'CH-01',
    customerId: options.customerId ?? `cust-${randomUUID()}`,
    commodityId: options.commodityId ?? `cmd-${randomUUID()}`,
    bagType: options.bagType ?? 'S',
    transactionType,
    smallQuantity: options.smallQuantity ?? 100,
    bigQuantity: options.bigQuantity ?? 0,
    referenceType: REFERENCE_BY_TYPE[transactionType],
    referenceId: options.referenceId ?? `ref-${randomUUID()}`,
    notes: null,
    createdBy: 'usr-fixture',
    createdAt: options.createdAt ?? new Date(),
  });

  return id;
}

export async function seedLedgerEntries(options: SeedLedgerOptions[]): Promise<string[]> {
  return Promise.all(options.map((o) => seedLedgerEntry(o)));
}

/** A date safely inside the previous calendar month, used to prove monthly windows are half-open. */
export function previousMonthDate(reference: Date = new Date()): Date {
  const previous = new Date(reference);
  previous.setDate(1);
  previous.setMonth(previous.getMonth() - 1);
  previous.setDate(15);
  return previous;
}
