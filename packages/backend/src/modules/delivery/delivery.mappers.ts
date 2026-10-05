import type { DeliveryChallan, DeliveryReversal } from '@cold-storage/contracts';
import type { DeliveryChallanDoc } from '../../database/models/delivery-challan.model.js';
import type { DeliveryReversalDoc } from '../../database/models/delivery-reversal.model.js';

export { isTransientError } from '../common/mongo-retry.helper.js';

export function toChallanEntity(doc: DeliveryChallanDoc | Record<string, unknown> | unknown): DeliveryChallan {
  const d = doc as Record<string, unknown>;
  const smallBags = Number(d.smallBags ?? 0);
  const bigBags = Number(d.bigBags ?? 0);
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
    chamber: String(d.chamber),
    smallBags,
    bigBags,
    // Derived for transport only; the composition is the stored fact.
    totalBags: smallBags + bigBags,
    marks: d.marks ? String(d.marks) : null,
    gpNumber: d.gpNumber ? String(d.gpNumber) : null,
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

export function toReversalEntity(doc: DeliveryReversalDoc | Record<string, unknown> | unknown): DeliveryReversal {
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
