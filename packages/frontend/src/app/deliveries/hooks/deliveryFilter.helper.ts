import type { DeliveryChallan } from '@cold-storage/contracts';
import type { DeliveryStatusTab } from './deliveryTabPersistence.helper';

export type { DeliveryStatusTab };
export type DeliveryRentStatusFilter = '' | 'SETTLED' | 'UNSETTLED' | 'PARTIAL' | 'PENDING';

export function isDeliverySettled(d: DeliveryChallan): boolean {
  if (d.rentPaymentStatus === 'Settled') return true;
  if (
    d.rentRemainingBalance !== undefined &&
    d.rentRemainingBalance === 0 &&
    (d.rentTotalAmount ?? 0) > 0
  ) {
    return true;
  }
  return false;
}

export function isDeliveryPartiallyPaid(d: DeliveryChallan): boolean {
  if (d.status === 'REVERSED') return false;
  if (isDeliverySettled(d)) return false;
  const remaining = d.rentRemainingBalance ?? 0;
  const paid = d.rentTotalPaid ?? 0;
  return remaining > 0 && paid > 0;
}

export function isDeliveryUnsettled(d: DeliveryChallan): boolean {
  if (d.status === 'REVERSED') return false;
  if (isDeliverySettled(d)) return false;
  const remaining =
    d.rentRemainingBalance ?? (d.rentPaymentStatus === 'Not Settled' ? d.rentCharge ?? 0 : d.rentCharge ?? 0);
  const paid = d.rentTotalPaid ?? 0;
  return remaining > 0 && paid === 0;
}

export const isDeliveryPendingPayment = isDeliveryUnsettled;

export function filterDeliveries(
  deliveries: DeliveryChallan[],
  searchTerm: string,
  rentStatusFilter: DeliveryRentStatusFilter = '',
  statusTab: DeliveryStatusTab = '',
): DeliveryChallan[] {
  let result = deliveries;

  if (statusTab === 'ACTIVE') {
    result = result.filter(
      (d) =>
        d.status === 'ISSUED' &&
        (d.remainingTotalBags === undefined || d.remainingTotalBags > 0),
    );
  } else if (statusTab === 'UNSETTLED' || statusTab === 'CLOSED') {
    result = result.filter(isDeliveryUnsettled);
  } else if (statusTab === 'PARTIAL') {
    result = result.filter(isDeliveryPartiallyPaid);
  }

  if (rentStatusFilter === 'SETTLED') {
    result = result.filter(isDeliverySettled);
  } else if (rentStatusFilter === 'PARTIAL') {
    result = result.filter(isDeliveryPartiallyPaid);
  } else if (rentStatusFilter === 'UNSETTLED' || rentStatusFilter === 'PENDING') {
    result = result.filter(isDeliveryUnsettled);
  }

  if (!searchTerm.trim()) return result;

  const term = searchTerm.toLowerCase();
  return result.filter((d) => {
    const matchChallan = d.challanNumber.toLowerCase().includes(term);
    const matchGrn = d.grnNumber.toLowerCase().includes(term);
    const matchCust = d.customerName.toLowerCase().includes(term);
    const matchComm = d.commodityName.toLowerCase().includes(term);
    const matchVeh = d.vehicleNumber?.toLowerCase().includes(term) ?? false;
    const matchDriver = d.driverName?.toLowerCase().includes(term) ?? false;
    const matchMarks = d.marks?.toLowerCase().includes(term) ?? false;
    return (
      matchChallan ||
      matchGrn ||
      matchCust ||
      matchComm ||
      matchVeh ||
      matchDriver ||
      matchMarks
    );
  });
}
