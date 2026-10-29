import { allocateHamaliShare, calculateHamaliAmount } from '@cold-storage/contracts';

export function formatBagCompositionText(
  bagType: string,
  totalBags: number,
  smallBags: number,
  bigBags: number,
): string {
  if (bagType === 'Hybrid') {
    return `${totalBags} Bags (Hybrid)`;
  }
  return `${smallBags} Small / ${bigBags} Big`;
}

export interface ProRataHamaliContext {
  originalBags?: number | null;
  priorDeliveredBags?: number | null;
  totalHamaliAmount?: number | null;
}

export function calculateProRataHamali(
  withdrawnBags: number,
  hamaliRate?: number | null,
  context?: ProRataHamaliContext,
): number {
  if (typeof hamaliRate !== 'number' || hamaliRate <= 0 || withdrawnBags <= 0) {
    return 0;
  }

  const totalBags = context?.originalBags ?? withdrawnBags;
  if (totalBags <= 0) return 0;

  const full =
    context?.totalHamaliAmount != null && context.totalHamaliAmount >= 0
      ? context.totalHamaliAmount
      : calculateHamaliAmount(totalBags, hamaliRate);

  if (full <= 0) return 0;

  const priorDelivered = Math.max(0, context?.priorDeliveredBags ?? 0);
  const prior = Number((full * (priorDelivered / totalBags)).toFixed(2));
  return allocateHamaliShare(full, withdrawnBags, totalBags, prior);
}

export function formatProRataHamaliText(
  withdrawnBags: number,
  hamaliRate?: number | null,
  context?: ProRataHamaliContext,
): string {
  const charge = calculateProRataHamali(withdrawnBags, hamaliRate, context);
  if (charge > 0 && typeof hamaliRate === 'number') {
    return `₹${charge.toLocaleString('en-IN', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })} (₹${hamaliRate}/bag)`;
  }
  return 'Not Applicable';
}

export function formatCurrencyAmount(amount: number): string {
  return `₹${amount.toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

