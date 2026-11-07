import type {
  PaymentStatus,
  RentDeliveryBill,
  RentState,
  RentSummaryDto,
  RentType,
} from '@cold-storage/contracts';
import type { RentFilterOptions } from './rentFilter.helper';

export interface RentBillTableRow {
  id: string;
  grnId: string;
  grnNumber: string;
  facilityId: string;
  customerId: string;
  customerName: string;
  commodityId?: string;
  commodityName: string;
  chamber: string;
  inwardDate: Date;
  date: Date;
  rentType: RentType;
  rentStructure: string;
  agreedRates?: string;
  totalBags: number;
  smallBags?: number | null;
  bigBags?: number | null;
  totalDue: number;
  totalPaid: number;
  remainingBalance: number;
  paymentStatus: PaymentStatus;
  rentState: RentState;
  challanNumber?: string;
  gpNumber?: string | null;
  deliveryId?: string;
  deliveryBill?: RentDeliveryBill;
  account: RentSummaryDto;
  remarks?: string | null;
  mergedIntoGrnNumber?: string | null;
  mergedIntoGrnId?: string | null;
  mergedConsignment?: RentSummaryDto['mergedConsignment'];
}

/**
 * Projects RentSummaryDto accounts into independent bill table rows.
 * When a GRN has multiple outward delivery challans (Gate Passes), each Gate Pass
 * is rendered as an independent bill row for direct inspection and collection.
 */
export function projectRentBillRows(accounts: RentSummaryDto[]): RentBillTableRow[] {
  const rows: RentBillTableRow[] = [];

  for (const acc of accounts) {
    const deliveryBills = acc.deliveryBills ?? [];

    if (deliveryBills.length > 0) {
      for (const bill of deliveryBills) {
        rows.push({
          id: `${acc.grnId}_del_${bill.deliveryId}`,
          grnId: acc.grnId,
          grnNumber: acc.grnNumber,
          facilityId: acc.facilityId,
          customerId: acc.customerId,
          customerName: acc.customerName,
          commodityId: acc.commodityId,
          commodityName: acc.commodityName,
          chamber: acc.chamber,
          inwardDate: acc.inwardDate,
          date: bill.date,
          rentType: acc.rentType,
          rentStructure: `${acc.rentType} · ₹${bill.rentCharge.toLocaleString('en-IN')}`,
          totalBags: bill.totalBags,
          smallBags: bill.smallBags,
          bigBags: bill.bigBags,
          totalDue: bill.rentCharge,
          totalPaid: bill.rentTotalPaid,
          remainingBalance: bill.rentRemainingBalance,
          paymentStatus: bill.rentPaymentStatus,
          rentState: bill.rentRemainingBalance <= 0 && bill.rentTotalPaid > 0 ? 'SETTLED' : 'UNBILLED',
          challanNumber: bill.challanNumber,
          gpNumber: bill.gpNumber,
          deliveryId: bill.deliveryId,
          deliveryBill: bill,
          account: acc,
          remarks: acc.remarks,
          mergedIntoGrnNumber: acc.mergedIntoGrnNumber,
          mergedIntoGrnId: acc.mergedIntoGrnId,
          mergedConsignment: acc.mergedConsignment,
        });
      }

      // If there is also inward storage rent for remaining stock not yet outwarded, include it
      const totalOutwardBilled = deliveryBills.reduce((s, b) => s + b.rentCharge, 0);
      const netDiff = Number((acc.rentAmount - totalOutwardBilled).toFixed(2));
      const remainingInwardRent = netDiff > 0 ? netDiff : 0;
      const remBags = acc.remainingBags ?? 0;
      if (remBags > 0 && remainingInwardRent > 0) {
        rows.push({
          id: `${acc.grnId}_inward`,
          grnId: acc.grnId,
          grnNumber: acc.grnNumber,
          facilityId: acc.facilityId,
          customerId: acc.customerId,
          customerName: acc.customerName,
          commodityId: acc.commodityId,
          commodityName: acc.commodityName,
          chamber: acc.chamber,
          inwardDate: acc.inwardDate,
          date: acc.rentGeneratedDate ?? acc.inwardDate,
          rentType: acc.rentType,
          rentStructure: `${acc.rentType} Inward Storage · ₹${remainingInwardRent.toLocaleString('en-IN')}`,
          totalBags: remBags,
          smallBags: acc.smallBags,
          bigBags: acc.bigBags,
          totalDue: remainingInwardRent,
          totalPaid: 0,
          remainingBalance: remainingInwardRent,
          paymentStatus: 'Not Settled',
          rentState: acc.rentState,
          account: acc,
          remarks: acc.remarks,
          mergedIntoGrnNumber: acc.mergedIntoGrnNumber,
          mergedIntoGrnId: acc.mergedIntoGrnId,
          mergedConsignment: acc.mergedConsignment,
        });
      }
    } else {
      // Standard single-bill GRN (inward seasonal or monthly)
      rows.push({
        id: acc.grnId,
        grnId: acc.grnId,
        grnNumber: acc.grnNumber,
        facilityId: acc.facilityId,
        customerId: acc.customerId,
        customerName: acc.customerName,
        commodityId: acc.commodityId,
        commodityName: acc.commodityName,
        chamber: acc.chamber,
        inwardDate: acc.inwardDate,
        date: acc.rentGeneratedDate ?? acc.inwardDate,
        rentType: acc.rentType,
        rentStructure: `${acc.rentType} · ₹${(acc.totalDue ?? acc.rentAmount).toLocaleString('en-IN')}`,
        totalBags: acc.totalBags,
        smallBags: acc.smallBags,
        bigBags: acc.bigBags,
        totalDue: acc.totalDue ?? acc.rentAmount,
        totalPaid: acc.totalPaid,
        remainingBalance: acc.remainingBalance,
        paymentStatus: acc.paymentStatus,
        rentState: acc.rentState,
        account: acc,
        remarks: acc.remarks,
        mergedIntoGrnNumber: acc.mergedIntoGrnNumber,
        mergedIntoGrnId: acc.mergedIntoGrnId,
        mergedConsignment: acc.mergedConsignment,
      });
    }
  }

  return rows;
}

export function filterRentBillRows(
  rows: RentBillTableRow[],
  options: RentFilterOptions,
): RentBillTableRow[] {
  const term = options.searchTerm.trim().toLowerCase();
  const { statusFilter, typeFilter } = options;

  return rows.filter((r) => {
    if (term) {
      const matchGrn = r.grnNumber.toLowerCase().includes(term);
      const matchCustomer = r.customerName.toLowerCase().includes(term);
      const matchCommodity = r.commodityName.toLowerCase().includes(term);
      const matchChamber = r.chamber.toLowerCase().includes(term);
      const matchChallan = r.challanNumber ? r.challanNumber.toLowerCase().includes(term) : false;
      const matchGp = r.gpNumber ? r.gpNumber.toLowerCase().includes(term) : false;
      const matchReceipt = r.account.payments.some((p) =>
        p.receiptNumber.toLowerCase().includes(term),
      );

      if (!matchGrn && !matchCustomer && !matchCommodity && !matchChamber && !matchChallan && !matchGp && !matchReceipt) {
        return false;
      }
    }

    if (typeFilter && r.rentType !== typeFilter) {
      return false;
    }

    if (statusFilter) {
      const isSettled = r.remainingBalance === 0 && r.totalPaid > 0;
      const isPartial = r.remainingBalance > 0 && r.totalPaid > 0;
      const isUnpaid = r.totalPaid === 0 && r.remainingBalance > 0;

      if (statusFilter === 'UNPAID' && !isUnpaid) return false;
      if (statusFilter === 'PARTIALLY_PAID' && !isPartial) return false;
      if (statusFilter === 'SETTLED' && !isSettled) return false;
      if (statusFilter === 'PENDING_DUES' && r.remainingBalance <= 0) return false;
      if (statusFilter === 'MERGED' && !r.mergedIntoGrnNumber && !r.mergedConsignment) return false;
    }

    return true;
  });
}
