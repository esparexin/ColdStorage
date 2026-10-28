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

export function calculateProRataHamali(
  totalBags: number,
  hamaliRate?: number | null,
): number {
  if (typeof hamaliRate === 'number' && hamaliRate > 0 && totalBags > 0) {
    return totalBags * hamaliRate;
  }
  return 0;
}

export function formatProRataHamaliText(
  totalBags: number,
  hamaliRate?: number | null,
): string {
  const charge = calculateProRataHamali(totalBags, hamaliRate);
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
