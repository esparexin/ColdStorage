import type { PaymentMode, RentSummaryDto } from '@cold-storage/contracts';

export interface CustomerRentOption {
  customerId: string;
  customerName: string;
  openGrnCount: number;
  totalOutstandingBalance: number;
}

export function getCustomersWithRentDues(accounts: RentSummaryDto[]): CustomerRentOption[] {
  const map = new Map<string, CustomerRentOption>();

  for (const acc of accounts) {
    if (acc.remainingBalance <= 0) continue;
    const existing = map.get(acc.customerId);
    if (existing) {
      existing.openGrnCount += 1;
      existing.totalOutstandingBalance = Number(
        (existing.totalOutstandingBalance + acc.remainingBalance).toFixed(2),
      );
    } else {
      map.set(acc.customerId, {
        customerId: acc.customerId,
        customerName: acc.customerName,
        openGrnCount: 1,
        totalOutstandingBalance: acc.remainingBalance,
      });
    }
  }

  return Array.from(map.values()).sort((a, b) => a.customerName.localeCompare(b.customerName));
}

export function getGrnsForCustomer(
  accounts: RentSummaryDto[],
  customerId: string,
): RentSummaryDto[] {
  return accounts
    .filter((acc) => acc.customerId === customerId && acc.remainingBalance > 0)
    .sort((a, b) => new Date(a.inwardDate).getTime() - new Date(b.inwardDate).getTime());
}

export function autoAllocatePayment(
  grns: RentSummaryDto[],
  totalAmount: number,
): Record<string, number> {
  const allocations: Record<string, number> = {};
  let remainingToDistribute = Math.max(0, totalAmount);

  for (const grn of grns) {
    if (remainingToDistribute <= 0) {
      allocations[grn.grnId] = 0;
      continue;
    }

    const alloc = Math.min(grn.remainingBalance, remainingToDistribute);
    allocations[grn.grnId] = Number(alloc.toFixed(2));
    remainingToDistribute = Number((remainingToDistribute - alloc).toFixed(2));
  }

  return allocations;
}

export function validateBatchCollectPayment(
  allocations: Record<string, number>,
  grns: RentSummaryDto[],
  paymentMode: PaymentMode,
  upiReference?: string,
): string | null {
  const totalAllocated = Object.values(allocations).reduce((sum, v) => sum + (v || 0), 0);

  if (totalAllocated <= 0) {
    return 'Total allocated payment must be greater than ₹0';
  }

  for (const grn of grns) {
    const allocated = allocations[grn.grnId] ?? 0;
    if (allocated < 0) {
      return `Allocated amount cannot be negative for GRN ${grn.grnNumber}`;
    }
    if (allocated > grn.remainingBalance) {
      return `Allocated ₹${allocated} exceeds remaining balance of ₹${grn.remainingBalance} for GRN ${grn.grnNumber}`;
    }
  }

  if (paymentMode === 'UPI') {
    const ref = upiReference?.trim() ?? '';
    if (!ref) {
      return 'UPI reference is required when payment mode is UPI';
    }
    if (ref.length < 6) {
      return 'UPI reference must be at least 6 characters';
    }
  }

  return null;
}
