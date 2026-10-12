import type { PaymentMode } from '@cold-storage/contracts';

export interface CollectPaymentFormValues {
  amount: number | '';
  mode: PaymentMode;
  date: string;
  notes: string;
  upiReference: string;
}

/**
 * Derives the remaining pending balance after payment.
 * Clamps to 0 and formats accurately to 2 decimal places.
 */
export function calculatePendingAfterPayment(
  remainingBalance: number,
  collectAmount: number | '',
): number {
  if (remainingBalance <= 0) return 0;
  const entered = typeof collectAmount === 'number' ? collectAmount : 0;
  return Math.max(0, Number((remainingBalance - entered).toFixed(2)));
}

/**
 * Validates rent collection input:
 * - Amount must be non-negative number
 * - Amount cannot exceed outstanding remaining balance
 * - UPI payment mode requires transaction reference
 */
export function validateCollectPayment(
  collectAmount: number | '',
  remainingBalance: number,
  collectMode: PaymentMode,
  upiReference: string,
): string | null {
  if (typeof collectAmount !== 'number' || collectAmount < 0) {
    return 'Payment amount cannot be negative';
  }
  if (collectAmount > remainingBalance) {
    return `Amount (₹${collectAmount}) exceeds remaining balance of ₹${remainingBalance}`;
  }
  if (collectMode === 'UPI' && !upiReference.trim()) {
    return 'Please enter a UPI transaction reference or ID';
  }
  return null;
}

/**
 * Determines whether the payment collection form contains unsaved user input.
 */
export function isCollectPaymentFormDirty(
  current: CollectPaymentFormValues,
  initial: CollectPaymentFormValues,
): boolean {
  return (
    current.amount !== initial.amount ||
    current.mode !== initial.mode ||
    current.date !== initial.date ||
    current.notes.trim() !== '' ||
    current.upiReference.trim() !== ''
  );
}
