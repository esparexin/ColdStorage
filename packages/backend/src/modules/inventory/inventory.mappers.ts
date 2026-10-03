import type { InventoryTransaction, PutAwayAllocation } from '@cold-storage/contracts';

export { isTransientError } from '../common/mongo-retry.helper.js';

export class ConcurrencyConflictError extends Error {
  public readonly statusCode = 409;
  public readonly code = 'CONCURRENCY_CONFLICT';

  constructor(message = 'Concurrent allocation conflict on this GRN. Please retry.') {
    super(message);
    this.name = 'ConcurrencyConflictError';
  }
}

export function toPutAwayEntity(doc: unknown): PutAwayAllocation {
  const d = doc as Record<string, unknown>;
  return {
    id: String(d.id),
    facilityId: String(d.facilityId),
    grnId: String(d.grnId),
    grnNumber: String(d.grnNumber),
    chamber: String(d.chamber),
    bags: Number(d.bags),
    notes: d.notes ? String(d.notes) : null,
    allocatedBy: String(d.allocatedBy),
    allocatedAt: d.allocatedAt instanceof Date ? d.allocatedAt : new Date(String(d.allocatedAt)),
  };
}

export function toLedgerEntity(doc: unknown): InventoryTransaction {
  const d = doc as Record<string, unknown>;
  return {
    id: String(d.id),
    facilityId: String(d.facilityId),
    grnId: String(d.grnId),
    grnNumber: String(d.grnNumber),
    chamber: String(d.chamber),
    customerId: String(d.customerId),
    commodityId: String(d.commodityId),
    bagType: d.bagType as InventoryTransaction['bagType'],
    transactionType: (d.transactionType as InventoryTransaction['transactionType']) ?? 'INWARD_PUTAWAY',
    quantity: Number(d.quantity),
    referenceType: (d.referenceType as InventoryTransaction['referenceType']) ?? 'PUT_AWAY',
    referenceId: String(d.referenceId),
    notes: d.notes ? String(d.notes) : null,
    createdBy: String(d.createdBy),
    createdAt: d.createdAt instanceof Date ? d.createdAt : new Date(String(d.createdAt)),
  };
}
