import type { RentSummaryDto } from '@cold-storage/contracts';

export type RentStatusFilter = '' | 'PENDING_DUES' | 'SETTLED' | 'NO_DUES';
export type RentTypeFilter = '' | 'Seasonal' | 'Monthly';

export interface RentFilterOptions {
  searchTerm: string;
  statusFilter: RentStatusFilter;
  typeFilter: RentTypeFilter;
}

/**
 * Pure filter helper for rent accounts ledger.
 * Matches search terms across GRN #, Customer, Commodity, Chamber, and Receipt numbers.
 * Supports granular status filtering (Pending Dues, Settled, No Dues) and Rent Structure types.
 */
export function filterRentAccounts(
  accounts: RentSummaryDto[],
  options: RentFilterOptions,
): RentSummaryDto[] {
  const term = options.searchTerm.trim().toLowerCase();
  const { statusFilter, typeFilter } = options;

  return accounts.filter((acc) => {
    if (term) {
      const matchGrn = acc.grnNumber.toLowerCase().includes(term);
      const matchCustomer = acc.customerName.toLowerCase().includes(term);
      const matchCommodity = acc.commodityName.toLowerCase().includes(term);
      const matchChamber = acc.chamber.toLowerCase().includes(term);
      const matchReceipt = acc.payments.some((p) =>
        p.receiptNumber.toLowerCase().includes(term),
      );

      if (!matchGrn && !matchCustomer && !matchCommodity && !matchChamber && !matchReceipt) {
        return false;
      }
    }

    if (typeFilter && acc.rentType !== typeFilter) {
      return false;
    }

    if (statusFilter) {
      if (statusFilter === 'PENDING_DUES') {
        const hasDues = acc.paymentStatus === 'Not Settled' || acc.remainingBalance > 0;
        if (!hasDues) return false;
      } else if (statusFilter === 'SETTLED') {
        const isSettledPaid = acc.paymentStatus === 'Settled' && acc.totalPaid > 0;
        if (!isSettledPaid) return false;
      } else if (statusFilter === 'NO_DUES') {
        const isNoDues = acc.paymentStatus === 'Settled' && acc.totalPaid === 0 && acc.rentAmount === 0;
        if (!isNoDues) return false;
      }
    }

    return true;
  });
}
