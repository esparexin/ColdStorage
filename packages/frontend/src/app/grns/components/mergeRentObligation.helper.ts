/**
 * mergeRentObligation.helper — Evaluates historical rent obligations,
 * payments, settled status, and carried repack hamali for merge sources.
 */

import type { Grn, RentSummaryDto } from '@cold-storage/contracts';

export interface DerivedMergeRentAssessment {
  historicalObligation: number;
  amountPaid: number;
  outstandingBalance: number;
  isSettled: boolean;
  carriedRent: number;
  repackHamali: number;
  totalCarried: number;
  inwardDateStr: string;
}

export function deriveMergeRentAssessment(params: {
  source: Grn;
  summary?: RentSummaryDto | null;
  repackMode: boolean;
  commodityHamaliRate: number;
  calculatedRent?: number;
}): DerivedMergeRentAssessment {
  const { source, summary, repackMode, commodityHamaliRate, calculatedRent } = params;
  const sourceBags = source.closingBags ?? source.bags;

  const baseObligation = summary
    ? (summary.totalDue > 0 ? summary.totalDue : summary.totalPaid > 0 ? summary.totalPaid : (summary.rentAmount ?? source.rentAmount ?? 0))
    : (source.rentAmount ?? 0);

  const amountPaid = summary
    ? summary.totalPaid
    : (source.rentPaymentStatus === 'Settled' && source.rentRemainingBalance === 0 ? (source.rentAmount ?? 0) : 0);

  const unbilledCalculatedObligation =
    typeof calculatedRent === 'number' && calculatedRent > 0
      ? calculatedRent
      : 0;

  const historicalObligation =
    baseObligation > 0
      ? baseObligation
      : unbilledCalculatedObligation > 0
        ? unbilledCalculatedObligation
        : 0;

  const outstandingBalance = summary && summary.totalDue > 0
    ? summary.remainingBalance
    : source.rentRemainingBalance !== undefined && source.rentRemainingBalance > 0
      ? source.rentRemainingBalance
      : source.rentPaymentStatus === 'Settled'
        ? 0
        : Math.max(0, historicalObligation - amountPaid);

  const isSettled = outstandingBalance === 0;
  const carriedRent = outstandingBalance;

  const repackHamali = repackMode && commodityHamaliRate > 0
    ? sourceBags * commodityHamaliRate
    : 0;
  const totalCarried = carriedRent + repackHamali;
  const inwardDateStr = source.date ? new Date(source.date).toLocaleDateString('en-IN') : '—';

  return {
    historicalObligation,
    amountPaid,
    outstandingBalance,
    isSettled,
    carriedRent,
    repackHamali,
    totalCarried,
    inwardDateStr,
  };
}
