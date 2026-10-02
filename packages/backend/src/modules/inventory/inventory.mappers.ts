import type {
  InventoryTransaction,
  PutAwayAllocation,
  PutAwayItem,
} from '@cold-storage/contracts';

export class ConcurrencyConflictError extends Error {
  public readonly statusCode = 409;
  public readonly code = 'CONCURRENCY_CONFLICT';

  constructor(
    message = 'Concurrent allocation conflict on storage position or GRN. Please retry.',
  ) {
    super(message);
    this.name = 'ConcurrencyConflictError';
  }
}

export function isTransientError(err: unknown): boolean {
  if (!err || typeof err !== 'object') {
    return false;
  }
  const mongoErr = err as {
    code?: number;
    hasErrorLabel?: (label: string) => boolean;
    message?: string;
  };
  if (
    typeof mongoErr.hasErrorLabel === 'function' &&
    mongoErr.hasErrorLabel('TransientTransactionError')
  ) {
    return true;
  }
  if (mongoErr.code === 112 || mongoErr.code === 251) {
    return true;
  }
  if (typeof mongoErr.message === 'string' && mongoErr.message.includes('WriteConflict')) {
    return true;
  }
  return false;
}

export function toPutAwayEntity(doc: any): PutAwayAllocation {
  const d = doc as Record<string, unknown>;
  return {
    id: String(d.id),
    facilityId: String(d.facilityId),
    grnId: String(d.grnId),
    grnNumber: String(d.grnNumber),
    chamberId: String(d.chamberId),
    items: (d.items as PutAwayItem[]) ?? [],
    totalBags: Number(d.totalBags),
    notes: d.notes ? String(d.notes) : null,
    allocatedBy: String(d.allocatedBy),
    allocatedAt: d.allocatedAt instanceof Date ? d.allocatedAt : new Date(String(d.allocatedAt)),
  };
}

export function toLedgerEntity(doc: any): InventoryTransaction {
  const d = doc as Record<string, unknown>;
  return {
    id: String(d.id),
    facilityId: String(d.facilityId),
    grnId: String(d.grnId),
    grnNumber: String(d.grnNumber),
    chamberId: String(d.chamberId),
    rackId: String(d.rackId),
    levelId: String(d.levelId),
    positionId: String(d.positionId),
    positionCode: String(d.positionCode),
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
