import type { InventoryTransaction } from '@cold-storage/contracts';

export class ConcurrencyConflictError extends Error {
  public readonly statusCode = 409;
  public readonly code = 'CONCURRENCY_CONFLICT';

  constructor(message = 'Concurrent allocation conflict on this GRN. Please retry.') {
    super(message);
    this.name = 'ConcurrencyConflictError';
  }
}

export function toLedgerEntity(doc: unknown): InventoryTransaction {
  const d = doc as Record<string, unknown>;
  const smallQuantity = Number(d.smallQuantity ?? 0);
  const bigQuantity = Number(d.bigQuantity ?? 0);
  return {
    id: String(d.id),
    facilityId: String(d.facilityId),
    grnId: String(d.grnId),
    grnNumber: String(d.grnNumber),
    chamber: String(d.chamber),
    commodityId: String(d.commodityId),
    bagType: d.bagType as InventoryTransaction['bagType'],
    transactionType: (d.transactionType as InventoryTransaction['transactionType']) ?? 'INWARD_PUTAWAY',
    smallQuantity,
    bigQuantity,
    // Derived for transport only. The database stores the composition and nothing else.
    quantity: smallQuantity + bigQuantity,
    referenceType: (d.referenceType as InventoryTransaction['referenceType']) ?? 'PUT_AWAY',
    referenceId: String(d.referenceId),
    notes: d.notes ? String(d.notes) : null,
    createdBy: String(d.createdBy),
    createdAt: d.createdAt instanceof Date ? d.createdAt : new Date(String(d.createdAt)),
  };
}
