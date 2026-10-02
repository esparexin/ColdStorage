import type { DeliveryChallan, DeliveryReversal } from '@cold-storage/contracts';
import type { DeliveryChallanDoc } from '../../database/models/delivery-challan.model.js';
import type { DeliveryReversalDoc } from '../../database/models/delivery-reversal.model.js';

export function toChallanEntity(doc: any): DeliveryChallan {
  const d = doc as Record<string, unknown>;
  return {
    id: String(d.id),
    facilityId: String(d.facilityId),
    challanNumber: String(d.challanNumber),
    date: d.date instanceof Date ? d.date : new Date(String(d.date)),
    grnId: String(d.grnId),
    grnNumber: String(d.grnNumber),
    customerId: String(d.customerId),
    customerName: String(d.customerName),
    commodityId: String(d.commodityId),
    commodityName: String(d.commodityName),
    chamberId: String(d.chamberId),
    chamberNumber: String(d.chamberNumber),
    items: (d.items as DeliveryChallan['items']) ?? [],
    totalBags: Number(d.totalBags),
    vehicleNumber: d.vehicleNumber ? String(d.vehicleNumber) : null,
    driverName: d.driverName ? String(d.driverName) : null,
    weight: d.weight !== null && d.weight !== undefined ? Number(d.weight) : null,
    remarks: d.remarks ? String(d.remarks) : null,
    status: d.status as DeliveryChallan['status'],
    issuedBy: String(d.issuedBy),
    createdAt: d.createdAt instanceof Date ? d.createdAt : new Date(String(d.createdAt)),
    updatedAt: d.updatedAt instanceof Date ? d.updatedAt : new Date(String(d.updatedAt)),
  };
}

export function toReversalEntity(doc: any): DeliveryReversal {
  const d = doc as Record<string, unknown>;
  return {
    id: String(d.id),
    facilityId: String(d.facilityId),
    deliveryId: String(d.deliveryId),
    challanNumber: String(d.challanNumber),
    grnId: String(d.grnId),
    reason: String(d.reason),
    reversedBy: String(d.reversedBy),
    reversedAt: d.reversedAt instanceof Date ? d.reversedAt : new Date(String(d.reversedAt)),
  };
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
