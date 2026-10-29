import type { RentSummaryDto } from '@cold-storage/contracts';

export type RentStatusFilter =
  | ''
  | 'UNPAID'
  | 'PARTIALLY_PAID'
  | 'SETTLED'
  | 'PENDING_DUES'
  | 'NO_DUES'
  | 'MERGED'
  | 'CLOSED_WITH_DUES';
export type RentTypeFilter = '' | 'Seasonal' | 'Monthly' | 'Seasonal_3M';

export interface RentFilterOptions {
  searchTerm: string;
  statusFilter: RentStatusFilter;
  typeFilter: RentTypeFilter;
}

export type RentAccountCategory = 'UNPAID' | 'PARTIALLY_PAID' | 'SETTLED' | 'NO_DUES';

/**
 * Determines the mutually exclusive rent status category for an account.
 * - 'NO_DUES': Unbilled / zero-dues account (totalPaid === 0 with 0 rent or 0 due).
 * - 'SETTLED': Settled account (payments made with remainingBalance === 0, or settled obligation).
 * - 'PARTIALLY_PAID': Payments have been made (totalPaid > 0) with an outstanding balance (remainingBalance > 0).
 * - 'UNPAID': No payment collected (totalPaid === 0) with an outstanding balance.
 */
export function getRentStatusCategory(
  acc: Pick<RentSummaryDto, 'totalPaid' | 'remainingBalance' | 'paymentStatus'> & {
    rentAmount?: number | null;
    totalDue?: number | null;
    rentState?: string | null;
  },
): RentAccountCategory {
  const isSettledOrZero = acc.remainingBalance === 0 || acc.paymentStatus === 'Settled';
  const isNoDues =
    acc.totalPaid === 0 &&
    isSettledOrZero &&
    ((acc.rentAmount ?? 0) === 0 || (acc.totalDue ?? 0) === 0 || acc.rentState === 'UNBILLED');

  if (isNoDues) {
    return 'NO_DUES';
  }
  if (isSettledOrZero) {
    return 'SETTLED';
  }
  if (acc.totalPaid > 0 && acc.remainingBalance > 0) {
    return 'PARTIALLY_PAID';
  }
  return 'UNPAID';
}

export function isMergedRentAccount(
  acc: Pick<RentSummaryDto, 'mergedIntoGrnNumber' | 'mergedIntoGrnId' | 'remarks'> & {
    mergedConsignment?: { isMergedTarget?: boolean } | null;
  },
): boolean {
  return Boolean(
    acc.mergedIntoGrnNumber ||
      acc.mergedIntoGrnId ||
      acc.mergedConsignment?.isMergedTarget ||
      (acc.remarks && acc.remarks.includes('[MERGE')),
  );
}

export function isClosedWithDuesRentAccount(
  acc: Pick<RentSummaryDto, 'remainingBags' | 'remainingBalance' | 'mergedIntoGrnNumber' | 'mergedIntoGrnId'>,
): boolean {
  const hasRemainingBalance = (acc.remainingBalance ?? 0) > 0;
  const isZeroStock = (acc.remainingBags ?? 0) === 0;
  const isMergedSource = Boolean(acc.mergedIntoGrnNumber || acc.mergedIntoGrnId);
  return hasRemainingBalance && (isZeroStock || isMergedSource);
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
      if (statusFilter === 'MERGED') {
        if (!isMergedRentAccount(acc)) return false;
      } else if (statusFilter === 'CLOSED_WITH_DUES') {
        if (!isClosedWithDuesRentAccount(acc)) return false;
      } else if (
        statusFilter === 'UNPAID' ||
        statusFilter === 'PARTIALLY_PAID' ||
        statusFilter === 'SETTLED' ||
        statusFilter === 'NO_DUES'
      ) {
        if (getRentStatusCategory(acc) !== statusFilter) return false;
      } else if (statusFilter === 'PENDING_DUES') {
        const hasDues = acc.paymentStatus === 'Not Settled' || acc.remainingBalance > 0;
        if (!hasDues) return false;
      }
    }

    return true;
  });
}
