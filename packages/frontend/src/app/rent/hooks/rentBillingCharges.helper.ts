import {
  resolveOutwardRates,
  type RentSummaryDto,
} from '@cold-storage/contracts';
import { formatAgreedRates } from './rentDisplay.helper';

export interface RentCalculationRow {
  id: string;
  dates: string;
  details: string;
  amount: number;
}

export function resolveBillingOutwardRates(
  account: RentSummaryDto,
  activeCommodityRate?: { smallRate: number; bigRate: number } | null,
): { small: number; big: number } {
  const hasCustomRates =
    account.smallBagPrice != null || account.bigBagPrice != null || account.bagPrice != null;
  if (hasCustomRates) {
    return resolveOutwardRates(account.rentType, {
      smallBagPrice: account.smallBagPrice,
      bigBagPrice: account.bigBagPrice,
      bagPrice: account.bagPrice,
    });
  }
  if (activeCommodityRate) {
    return {
      small: activeCommodityRate.smallRate,
      big: activeCommodityRate.bigRate,
    };
  }
  return resolveOutwardRates(account.rentType, {});
}

/**
 * Resolves the authoritative Hamali rate for itemized rent breakdown rows.
 *
 * Invariant (4 Lifecycle Billing Flows):
 * - Hamali is NOT re-calculated on live resting chamber bags after a merge or repack.
 * - Prioritizes the authoritative commodity master rate when configured.
 * - Preserves explicit zero-hamali exemptions (`hamaliShare === 0`).
 * - Only falls back to dividing `hamaliShare / totalBags` when no commodity rate is configured.
 */
export function resolveBillingHamaliRate(
  account: RentSummaryDto,
  activeCommodityRate?: { hamaliRate?: number | null } | null,
): number | undefined {
  if (account.hamaliShare === 0) {
    return undefined;
  }
  if (typeof activeCommodityRate?.hamaliRate === 'number' && activeCommodityRate.hamaliRate > 0) {
    return activeCommodityRate.hamaliRate;
  }
  if (typeof account.hamaliShare === 'number' && account.hamaliShare > 0 && account.totalBags > 0) {
    return Number((account.hamaliShare / account.totalBags).toFixed(2));
  }
  return undefined;
}

export interface BuildRentCalculationRowsParams {
  account: RentSummaryDto;
  originSeason: number;
  effectiveStorageAmount: number;
  excludePeriodKeys: string[];
  hamaliDue: number;
  hamaliRate?: number;
}

export function buildRentCalculationRows(params: BuildRentCalculationRowsParams): RentCalculationRow[] {
  const {
    account,
    originSeason,
    effectiveStorageAmount,
    hamaliDue,
    hamaliRate,
  } = params;

  const list: RentCalculationRow[] = [];
  const agreedRates = formatAgreedRates(account);

  // 1. Inward Storage Rent Row
  let datesLabel = `(${originSeason}) Mar - Dec`;
  if (account.rentType === 'Seasonal_3M') {
    datesLabel = `(${originSeason}) 3M Seasonal`;
  } else if (account.rentType === 'Monthly') {
    datesLabel = `Monthly (${account.rentMonths ?? 1} mo)`;
  }

  let formula = '';
  const numSmall = typeof account.smallBags === 'number' ? account.smallBags : 0;
  const numBig = typeof account.bigBags === 'number' ? account.bigBags : 0;
  const hasSmall = numSmall > 0;
  const hasBig = numBig > 0;
  const sRate = account.smallBagPrice ?? (hasSmall && !hasBig && account.rentAmount > 0 ? account.rentAmount / numSmall : null);
  const bRate = account.bigBagPrice ?? (hasBig && !hasSmall && account.rentAmount > 0 ? account.rentAmount / numBig : null);

  if (hasSmall && hasBig && sRate != null && bRate != null) {
    formula = `${numSmall} Small × ₹${sRate.toFixed(2)} + ${numBig} Big × ₹${bRate.toFixed(2)}`;
  } else if (hasSmall && !hasBig && sRate != null) {
    formula = `${numSmall} Small × ₹${sRate.toFixed(2)} (₹${account.rentAmount.toLocaleString('en-IN')})`;
  } else if (hasBig && !hasSmall && bRate != null) {
    formula = `${numBig} Big × ₹${bRate.toFixed(2)} (₹${account.rentAmount.toLocaleString('en-IN')})`;
  } else if (account.bagType === 'Hybrid' && account.rentAmount > 0) {
    formula = `${account.totalBags} Hybrid (₹${account.rentAmount.toLocaleString('en-IN')})`;
  } else if (account.smallBagPrice != null || account.bigBagPrice != null) {
    formula = agreedRates ? `${account.totalBags} bags (${agreedRates})` : `${account.totalBags} bags`;
  } else if (account.bagPrice != null && account.bagPrice > 0) {
    formula = `${account.totalBags} bags × ₹${account.bagPrice.toFixed(2)} (₹${account.rentAmount.toLocaleString('en-IN')})`;
  } else if (account.rentAmount > 0 && account.totalBags > 0) {
    formula = `${account.totalBags} bags (Contract Rent: ₹${account.rentAmount.toLocaleString('en-IN')})`;
  } else {
    formula = 'Pending assessment';
  }

  list.push({
    id: 'storage-rent',
    dates: datesLabel,
    details: formula,
    amount: effectiveStorageAmount,
  });

  // 2. Finalized Extensions Rows with Strict Two-Month Period Combination (Jan - Feb)
  const extBagLabel = hasSmall && !hasBig ? 'Small' : hasBig && !hasSmall ? 'Big' : 'Bags';

  const sortedExtensions = [...account.extensions].sort((a, b) => {
    if (a.seasonYear !== b.seasonYear) return a.seasonYear - b.seasonYear;
    const order: Record<string, number> = { SEASON: 1, JANUARY: 2, FEBRUARY: 3 };
    return (order[a.period] ?? 99) - (order[b.period] ?? 99);
  });

  for (let i = 0; i < sortedExtensions.length; i++) {
    const ext = sortedExtensions[i];
    if (ext.period === 'SEASON') {
      list.push({
        id: ext.id,
        dates: `(${ext.seasonYear}) Season Renewal`,
        details: `${ext.snapshotBags} ${extBagLabel} × ₹${ext.bagRate.toFixed(2)} (₹${ext.finalAmount.toLocaleString('en-IN')})`,
        amount: ext.finalAmount,
      });
    } else if (ext.period === 'JANUARY') {
      const nextExt = sortedExtensions[i + 1];
      if (nextExt && nextExt.period === 'FEBRUARY' && nextExt.seasonYear === ext.seasonYear) {
        const combinedAmt = Number((ext.finalAmount + nextExt.finalAmount).toFixed(2));
        list.push({
          id: `${ext.id}_${nextExt.id}`,
          dates: `(${ext.seasonYear + 1}) Jan - Feb`,
          details: `${ext.snapshotBags} ${extBagLabel} × ₹${(ext.bagRate * 2).toFixed(2)} (₹${combinedAmt.toLocaleString('en-IN')}) (2 months)`,
          amount: combinedAmt,
        });
        i++; // skip February since paired
      } else {
        list.push({
          id: ext.id,
          dates: `(${ext.seasonYear + 1}) Jan`,
          details: `${ext.snapshotBags} ${extBagLabel} × ₹${ext.bagRate.toFixed(2)} (₹${ext.finalAmount.toLocaleString('en-IN')})`,
          amount: ext.finalAmount,
        });
      }
    } else if (ext.period === 'FEBRUARY') {
      list.push({
        id: ext.id,
        dates: `(${ext.seasonYear + 1}) Feb`,
        details: `${ext.snapshotBags} ${extBagLabel} × ₹${ext.bagRate.toFixed(2)} (₹${ext.finalAmount.toLocaleString('en-IN')})`,
        amount: ext.finalAmount,
      });
    }
  }

  // 3. Hamali Charges Row:
  // Reflects the frozen one-time inward intake obligation established on entry.
  // When stock is merged/repacked (e.g. 2 bags inward -> 8 bags in chamber), obligationBags
  // derives the original intake bags that incurred the charge (Math.round(hamaliDue / rate)),
  // preventing artificial dilution or fictitious fractional rates across chamber bags.
  if (hamaliDue > 0) {
    const rate = hamaliRate ?? (account.totalBags > 0 ? Number((hamaliDue / account.totalBags).toFixed(2)) : undefined);
    let details = 'Inward unloading handling assessment';
    if (rate != null && rate > 0) {
      const obligationBags = Math.round(hamaliDue / rate);
      if (obligationBags > 0 && Math.abs(obligationBags * rate - hamaliDue) < 0.05) {
        details = `${obligationBags} bags × ₹${rate.toFixed(2)} / bag`;
      } else if (account.totalBags > 0) {
        details = `${account.totalBags} bags × ₹${rate.toFixed(2)} / bag`;
      }
    }

    list.push({
      id: 'hamali-charges',
      dates: 'Hamali Charges',
      details,
      amount: hamaliDue,
    });
  }

  return list;
}

