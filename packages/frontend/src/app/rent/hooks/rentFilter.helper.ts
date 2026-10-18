import type { RentSummaryDto } from '@cold-storage/contracts';

export type RentStatusFilter =
  | ''
  | 'UNPAID'
  | 'PARTIALLY_PAID'
  | 'SETTLED'
  | 'PENDING_DUES'
  | 'NO_DUES';
export type RentTypeFilter = '' | 'Seasonal' | 'Monthly' | 'Seasonal_3M';

export interface RentFilterOptions {
  searchTerm: string;
  statusFilter: RentStatusFilter;
  typeFilter: RentTypeFilter;
}

/**
 * Determines the mutually exclusive rent status category for an account.
 * - 'SETTLED': Zero remaining balance or explicit 'Settled' status.
 * - 'PARTIALLY_PAID': Payments have been made (totalPaid > 0) with an outstanding balance (remainingBalance > 0).
 * - 'UNPAID': No payment collected (totalPaid === 0) with an outstanding balance.
 */
export function getRentStatusCategory(
  acc: Pick<RentSummaryDto, 'totalPaid' | 'remainingBalance' | 'paymentStatus'>,
): 'UNPAID' | 'PARTIALLY_PAID' | 'SETTLED' {
  if (acc.remainingBalance === 0 || acc.paymentStatus === 'Settled') {
    return 'SETTLED';
  }
  if (acc.totalPaid > 0 && acc.remainingBalance > 0) {
    return 'PARTIALLY_PAID';
  }
  return 'UNPAID';
}

/**
 * Pure filter helper for rent accounts ledger.
 * Matches search terms across GRN #, Customer, Commodity, Chamber, and Receipt numbers.
 * Supports mutually exclusive status filtering (Unpaid, Partially Paid, Settled) and Rent Structure types.
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
      if (
        statusFilter === 'UNPAID' ||
        statusFilter === 'PARTIALLY_PAID' ||
        statusFilter === 'SETTLED'
      ) {
        if (getRentStatusCategory(acc) !== statusFilter) return false;
      } else if (statusFilter === 'PENDING_DUES') {
        const hasDues = acc.paymentStatus === 'Not Settled' || acc.remainingBalance > 0;
        if (!hasDues) return false;
      } else if (statusFilter === 'NO_DUES') {
        const isNoDues = acc.paymentStatus === 'Settled' && acc.totalPaid === 0 && acc.rentAmount === 0;
        if (!isNoDues) return false;
      }
    }

    return true;
  });
}
