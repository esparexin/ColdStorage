export interface RentAccountDisplayInput {
  rentType: 'Seasonal' | 'Monthly' | string;
  rentMonths?: number | null;
  rentAmount: number;
  /** Pooled obligation incl. finalized periods; falls back to rentAmount. */
  totalDue?: number;
  totalPaid?: number;
  remainingBalance?: number;
  paymentStatus?: 'Settled' | 'Not Settled';
  deliveredBags?: number;
  bagPrice?: number | null;
  smallBagPrice?: number | null;
  bigBagPrice?: number | null;
  totalBagsWeight?: number | null;
  mergedIntoGrnNumber?: string | null;
}

/**
 * Billed total for tables and overview cards: pooled total due when finalized
 * periods exist, else the original obligation. Pure display, no math duplicated.
 */
export function formatRentStructure(input: RentAccountDisplayInput): string {
  if (input.rentType === 'Monthly' && input.rentAmount === 0) {
    return 'Dynamic';
  }
  if (input.rentAmount === 0) {
    return 'At Outward';
  }
  return `₹${(input.totalDue ?? input.rentAmount).toLocaleString('en-IN')}`;
}

/**
 * Returns formatted agreed rates string if present.
 */
export function formatAgreedRates(input: RentAccountDisplayInput): string | null {
  if (input.smallBagPrice != null || input.bigBagPrice != null) {
    const s = input.smallBagPrice != null ? `S: ₹${input.smallBagPrice.toFixed(2)}` : null;
    const b = input.bigBagPrice != null ? `B: ₹${input.bigBagPrice.toFixed(2)}` : null;
    return [s, b].filter(Boolean).join(' | ');
  }
  if (input.bagPrice != null && input.bagPrice > 0) {
    return `₹${input.bagPrice.toFixed(2)}/bag`;
  }
  return null;
}

/**
 * Returns formatted remaining due amount or status string.
 */
export function formatRemainingDue(input: RentAccountDisplayInput): string {
  const balance = input.remainingBalance ?? 0;
  if (input.rentType === 'Monthly' && input.rentAmount === 0 && balance === 0) {
    return 'Dynamic (Per Cycle)';
  }
  if (input.rentAmount === 0 && balance === 0) {
    return '₹0 (No Dues)';
  }
  if (balance === 0) {
    return '₹0 (Settled)';
  }
  return `₹${balance.toLocaleString('en-IN')}`;
}

/**
 * Returns formatted status badge label and variant.
 */
export function formatPaymentStatus(input: RentAccountDisplayInput): {
  label: string;
  variant: 'success' | 'warning' | 'neutral';
} {
  const isSettled =
    input.remainingBalance != null
      ? input.remainingBalance === 0
      : input.paymentStatus === 'Settled';
  const totalPaid = input.totalPaid ?? 0;

  if (isSettled) {
    if (totalPaid === 0 && input.rentAmount === 0) {
      return { label: 'No Dues', variant: 'success' };
    }
    return { label: 'Settled', variant: 'success' };
  }

  return { label: 'Pending', variant: 'warning' };
}

/**
 * Returns contextual operator informational banners for payment collection modal.
 */
export function getRentCollectionNotice(input: RentAccountDisplayInput): string | null {
  if (input.mergedIntoGrnNumber) {
    return `This GRN was merged into GRN ${input.mergedIntoGrnNumber}. This is an independent bill for this GRN's unpaid balance and is not carried forward to the target GRN.`;
  }
  const balance = input.remainingBalance ?? 0;
  const delivered = input.deliveredBags ?? 0;

  if (input.rentType === 'Monthly' && input.rentAmount === 0) {
    return 'No fixed upfront contract rent configured for this Monthly GRN. Billing accrues dynamically per cycle.';
  }
  if (input.rentAmount === 0 && balance === 0) {
    return 'Rent is assessed upon outward delivery dispatch. There are currently no outstanding outward dues for this GRN.';
  }
  if (delivered > 0 && balance > 0) {
    return `Rent obligation is derived from ${delivered} outward delivered bag${delivered === 1 ? '' : 's'}.`;
  }
  return null;
}

/** Formats clean descriptive season, months, and agreed rates for original billing period. */
export function formatBillingPeriodSubtitle(params: {
  rentType: 'Seasonal' | 'Monthly' | 'Seasonal_3M' | string;
  seasonYear: number;
  totalBags: number;
  rates?: string | null;
  rentMonths?: number | null;
}): string {
  const { rentType, seasonYear, totalBags, rates, rentMonths } = params;
  const ratePart = rates ? ` · ${rates}` : '';
  if (rentType === 'Seasonal') {
    return `March ${seasonYear} – December ${seasonYear} (10 months) · ${totalBags.toLocaleString('en-IN')} bags${ratePart}`;
  }
  if (rentType === 'Seasonal_3M') {
    const months = rentMonths ?? 3;
    return `3-Month Seasonal Period (${months} month${months === 1 ? '' : 's'}) · ${totalBags.toLocaleString('en-IN')} bags${ratePart}`;
  }
  if (rentType === 'Monthly') {
    const months = rentMonths ?? 1;
    return `Monthly Storage (${months} month${months === 1 ? '' : 's'}) · ${totalBags.toLocaleString('en-IN')} bags${ratePart}`;
  }
  return `${totalBags.toLocaleString('en-IN')} bags${ratePart}`;
}

/** Formats clean descriptive period, months, and snapshot rate for extension periods. */
export function formatExtensionPeriodSubtitle(params: {
  period: 'JANUARY' | 'FEBRUARY' | 'SEASON' | string;
  seasonYear: number;
  snapshotBags: number;
  bagRate: number;
}): string {
  const { period, seasonYear, snapshotBags, bagRate } = params;
  if (period === 'SEASON') {
    return `March ${seasonYear} – December ${seasonYear} (10 months renewal) · Snapshot ${snapshotBags.toLocaleString('en-IN')} bags · ₹${bagRate.toFixed(2)}/bag`;
  }
  const monthName = period === 'JANUARY' ? 'January' : 'February';
  return `${monthName} ${seasonYear + 1} (1 month extension) · Snapshot ${snapshotBags.toLocaleString('en-IN')} bags · ₹${bagRate.toFixed(2)}/bag`;
}

/** Derives any applicable Hamali handling charge included in totalDue. */
export function deriveHamaliChargeFromSummary(totalDue: number, rentAmount: number, extensions: { finalAmount: number }[]): number {
  const sumExt = extensions.reduce((acc, e) => acc + e.finalAmount, 0);
  const diff = totalDue - (rentAmount + sumExt);
  return diff > 0 ? Number(diff.toFixed(2)) : 0;
}

export interface OwnershipTransferDisplayInfo {
  isTransferred: boolean;
  fromParty?: string;
  toParty?: string;
  hasCarriedDebt: boolean;
}

/**
 * Parses ownership transfer audit notes from GRN remarks for rent display attribution.
 */
export function parseOwnershipTransferDisplayInfo(remarks?: string | null): OwnershipTransferDisplayInfo | null {
  if (!remarks || !remarks.includes('[OWNERSHIP TRANSFERRED')) {
    return null;
  }
  const match = remarks.match(
    /\[OWNERSHIP TRANSFERRED on ([^:]+):\s*from\s+([^(]+)(?:\s*\([^)]*\))?\s+to\s+([^(]+)(?:\s*\([^)]*\))?\./i,
  );
  const hasCarriedDebt =
    remarks.includes('carried forward') || remarks.includes('Pending rent obligation');

  if (!match) {
    return {
      isTransferred: true,
      hasCarriedDebt,
    };
  }

  return {
    isTransferred: true,
    fromParty: match[2].trim(),
    toParty: match[3].trim(),
    hasCarriedDebt,
  };
}


