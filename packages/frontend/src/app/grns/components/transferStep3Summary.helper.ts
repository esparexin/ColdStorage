import type { TransferPaymentDecision } from '@cold-storage/contracts';

export function formatTransferComposition(params: {
  isHybrid: boolean;
  remainingBags: number;
  confirmedSmallBags?: number | '';
  confirmedBigBags?: number | '';
}): string {
  if (params.isHybrid) {
    return `${params.remainingBags} Hybrid`;
  }
  const s = typeof params.confirmedSmallBags === 'number' ? params.confirmedSmallBags : 0;
  const b = typeof params.confirmedBigBags === 'number' ? params.confirmedBigBags : 0;
  return `${s} Small + ${b} Big`;
}

export function formatTransferHamali(params: {
  hamaliRate?: number | null;
  hamaliAmount?: number;
}): string {
  const rate = params.hamaliRate ?? 0;
  const amount = params.hamaliAmount ?? 0;
  if (rate > 0) {
    return `₹${rate}/bag (₹${amount.toLocaleString('en-IN')})`;
  }
  return 'None';
}

export function formatTransferSettlement(params: {
  effectiveDue: number;
  decision: TransferPaymentDecision;
  settleAmount: number;
  newCustomerName?: string;
}): string {
  if (params.effectiveDue <= 0) {
    return 'Fully Settled (₹0 due)';
  }
  if (params.decision === 'SETTLE_NOW') {
    return `Pay Now (₹${params.settleAmount.toLocaleString('en-IN')} settled)`;
  }
  const target = params.newCustomerName ? `to ${params.newCustomerName}` : 'forward';
  return `Pay Later (Liability carried ${target})`;
}
