import type { OperationalBagType } from '@cold-storage/contracts';

export function formatRepackComposition(
  repackMode: boolean,
  repackBagType: OperationalBagType,
  repackSmall: number | '',
  repackBig: number | '',
  actualRepackedBags: number,
  totalSourceBags: number,
  totalConsolidatedBags?: number,
): string {
  if (repackMode) {
    if (repackBagType === 'Hybrid') {
      return `${actualRepackedBags} Bags (Hybrid)`;
    }
    const small = typeof repackSmall === 'number' ? repackSmall : 0;
    const big = typeof repackBig === 'number' ? repackBig : 0;
    return `${small} Small / ${big} Big (${actualRepackedBags} Total)`;
  }
  const pool = typeof totalConsolidatedBags === 'number' && totalConsolidatedBags > 0 ? totalConsolidatedBags : totalSourceBags;
  return `${pool} Bags (Consolidated Pool)`;
}

export function formatRepackHamali(
  repackHamaliCharge: number,
  actualRepackedBags: number,
  commodityHamaliRate: number,
): string {
  if (repackHamaliCharge > 0) {
    return `₹${repackHamaliCharge.toLocaleString('en-IN', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })} (${actualRepackedBags} bags @ ₹${commodityHamaliRate}/bag)`;
  }
  return 'Not Applicable';
}
