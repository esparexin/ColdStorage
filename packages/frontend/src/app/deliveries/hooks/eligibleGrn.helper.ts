import type { Grn, GrnInventorySummary } from '@cold-storage/contracts';
import { formatDisplayDate } from '../../../lib/date-format';
import type { GrnWithdrawal } from '../types';

export const INWARD_STOCK_PAGE_SIZE = 10;

/**
 * Formats a GRN date safely into standard Indian localized date string (e.g. 10 Oct 2026).
 */
export function formatGrnDate(dateVal?: string | Date | null): string {
  return formatDisplayDate(dateVal);
}

/**
 * Filters eligible inward GRNs with available stock based on search query matching
 * GRN #, Customer, Commodity, Marks, or Chamber. Exhausted stock consignments are excluded.
 */
export function filterEligibleGrns(grns: Grn[], query: string): Grn[] {
  const withStock = grns.filter((g) => getAvailableStockBags(g) > 0);
  if (!query.trim()) return withStock;
  const q = query.trim().toLowerCase();
  return withStock.filter(
    (g) =>
      g.grnNumber.toLowerCase().includes(q) ||
      g.customerName.toLowerCase().includes(q) ||
      g.commodityName.toLowerCase().includes(q) ||
      (Boolean(g.storageMark) && g.storageMark!.toLowerCase().includes(q)) ||
      (Boolean(g.partyMark) && g.partyMark!.toLowerCase().includes(q)) ||
      (Boolean(g.chamber) && g.chamber.toLowerCase().includes(q)),
  );
}

/**
 * Calculates pagination slices and boundary bounds for eligible inward GRNs.
 */
export function paginateEligibleGrns(
  grns: Grn[],
  page: number,
  pageSize = INWARD_STOCK_PAGE_SIZE,
): {
  items: Grn[];
  totalPages: number;
  safePage: number;
  totalRecords: number;
} {
  const totalRecords = grns.length;
  const totalPages = Math.max(1, Math.ceil(totalRecords / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const start = (safePage - 1) * pageSize;
  const items = grns.slice(start, start + pageSize);

  return {
    items,
    totalPages,
    safePage,
    totalRecords,
  };
}

/**
 * Resolves the primary storage mark and secondary party mark for display.
 */
export function getEligibleGrnMarks(grn: Grn): {
  primaryMark: string;
  partyMarkSub?: string;
} {
  const primaryMark = grn.storageMark || grn.grnNumber;
  const partyMarkSub =
    grn.partyMark && grn.partyMark !== grn.storageMark ? grn.partyMark : undefined;

  return { primaryMark, partyMarkSub };
}

/**
 * Returns available stock bags with fallback to inward bags, clamped at 0.
 */
export function getAvailableStockBags(grn: Grn): number {
  return Math.max(0, grn.closingBags ?? grn.bags ?? 0);
}

/**
 * Calculates remaining stock after deducting currently entered small and big bags.
 */
export function calculateRemainingStock(
  availableTotal: number,
  smallBags: number,
  bigBags: number,
): number {
  const s = Math.max(0, smallBags || 0);
  const b = Math.max(0, bigBags || 0);
  return Math.max(0, availableTotal - (s + b));
}

/**
 * Clamps bag allocation to ensure the combined quantity cannot exceed available stock.
 * When remaining stock is 0, prevents any further increase.
 */
export function clampBagAllocation(
  value: number,
  otherBagValue: number,
  availableTotal: number,
  maxCategoryStock?: number,
): number {
  if (isNaN(value) || value <= 0) return 0;
  const other = Math.max(0, otherBagValue || 0);
  const remainingAllowed = Math.max(0, availableTotal - other);
  const categoryCap =
    typeof maxCategoryStock === 'number'
      ? Math.min(maxCategoryStock, remainingAllowed)
      : remainingAllowed;
  return Math.min(value, categoryCap);
}

/**
 * Clears entered counts when the outward bag category changes. Stale counts
 * from the previous category would otherwise disagree with the new mode's
 * total (backend derives the withdrawal from the category) and surface as a
 * confusing rent-charge mismatch at submit. Availability ceilings are kept.
 */
export function clearWithdrawalCounts(prev: GrnWithdrawal): GrnWithdrawal {
  return { ...prev, smallBags: '', bigBags: '', quantity: '' };
}

/**
 * Per-side ceilings for delivery validation. Uses the live inventory summary
 * when loaded so segregated lots validate against true per-side balances;
 * falls back to the withdrawal state's ceilings beforehand.
 */
export function resolveValidationStock(
  summary: Pick<GrnInventorySummary, 'availableSmallBags' | 'availableBigBags'> | null | undefined,
  fallback: Pick<GrnWithdrawal, 'availableSmall' | 'availableBig'>,
): Pick<GrnWithdrawal, 'availableSmall' | 'availableBig'> {
  return {
    availableSmall: summary?.availableSmallBags ?? fallback.availableSmall,
    availableBig: summary?.availableBigBags ?? fallback.availableBig,
  };
}
