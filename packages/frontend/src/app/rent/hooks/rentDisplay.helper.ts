export interface RentAccountDisplayInput {
  rentType: 'Seasonal' | 'Monthly' | string;
  rentMonths?: number | null;
  rentAmount: number;
  totalPaid?: number;
  remainingBalance?: number;
  paymentStatus?: 'Settled' | 'Not Settled';
  deliveredBags?: number;
}

/**
 * Returns user-friendly rent structure label for tables and overview cards.
 */
export function formatRentStructure(input: RentAccountDisplayInput): string {
  if (input.rentType === 'Monthly' && input.rentAmount === 0) {
    return 'Dynamic';
  }
  if (input.rentAmount === 0) {
    return 'At Outward';
  }
  return `₹${input.rentAmount.toLocaleString('en-IN')}`;
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
  return `₹${balance.toLocaleString('en-IN')}`;
}

/**
 * Returns formatted status badge label and variant.
 */
export function formatPaymentStatus(input: RentAccountDisplayInput): {
  label: string;
  variant: 'success' | 'warning';
} {
  const isSettled = input.paymentStatus === 'Settled';
  const totalPaid = input.totalPaid ?? 0;

  if (isSettled) {
    if (totalPaid === 0 && input.rentAmount === 0) {
      return { label: 'No Dues', variant: 'success' };
    }
    return { label: 'Settled', variant: 'success' };
  }

  return { label: 'Pending Dues', variant: 'warning' };
}

/**
 * Returns contextual operator informational banners for payment collection modal.
 */
export function getRentCollectionNotice(input: RentAccountDisplayInput): string | null {
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
