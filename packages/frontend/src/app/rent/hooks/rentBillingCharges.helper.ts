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

export function resolveBillingHamaliRate(
  account: RentSummaryDto,
  activeCommodityRate?: { hamaliRate?: number | null } | null,
): number | undefined {
  if (typeof account.hamaliRate === 'number' && account.hamaliRate > 0) {
    return account.hamaliRate;
  }
  if (typeof account.hamaliShare === 'number') {
    if (account.hamaliShare > 0 && account.totalBags > 0) {
      return Number((account.hamaliShare / account.totalBags).toFixed(2));
    }
    // Explicit hamaliShare === 0: historical zero Hamali snapshot must be preserved
    return undefined;
  }
  if (typeof activeCommodityRate?.hamaliRate === 'number' && activeCommodityRate.hamaliRate > 0) {
    return activeCommodityRate.hamaliRate;
  }
  return undefined;
}

export interface BuildRentCalculationRowsParams {
  account: RentSummaryDto;
  originSeason: number;
  effectiveStorageAmount: number;
  excludePeriodKeys: string[];
  hamaliDue: number;
}

export function buildRentCalculationRows(params: BuildRentCalculationRowsParams): RentCalculationRow[] {
  const {
    account,
    originSeason,
    effectiveStorageAmount,
    hamaliDue,
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
    formula = 'Assessed at outward delivery dispatch';
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

  // 3. Hamali Charges Row (only when confirmed eligible hamali exists)
  if (hamaliDue > 0) {
    list.push({
      id: 'hamali-charges',
      dates: 'Direct Hamali Inward',
      details: 'Inward unloading handling assessment',
      amount: hamaliDue,
    });
  }

  return list;
}

