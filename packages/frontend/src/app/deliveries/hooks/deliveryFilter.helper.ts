import type { DeliveryChallan } from '@cold-storage/contracts';

export type DeliveryRentStatusFilter = '' | 'SETTLED' | 'PENDING';

export function filterDeliveries(
  deliveries: DeliveryChallan[],
  searchTerm: string,
  rentStatusFilter: DeliveryRentStatusFilter = '',
): DeliveryChallan[] {
  let result = deliveries;

  if (rentStatusFilter === 'SETTLED') {
    result = result.filter((d) => d.rentPaymentStatus === 'Settled');
  } else if (rentStatusFilter === 'PENDING') {
    result = result.filter(
      (d) => d.rentPaymentStatus !== 'Settled' || (d.rentRemainingBalance ?? 0) > 0,
    );
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
