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
 * GRN #, Customer, Commodity, Marks, Chamber, or merged remarks.
 * Closed consignments and exhausted stock are excluded.
 */
export function filterEligibleGrns(grns: Grn[], query: string): Grn[] {
  const withStock = grns.filter((g) => getAvailableStockBags(g) > 0 && g.status !== 'CLOSED' && !g.mergedIntoGrnId);
  if (!query.trim()) return withStock;
  const q = query.trim().toLowerCase();
  return withStock.filter(
    (g) =>
      g.grnNumber.toLowerCase().includes(q) ||
      g.customerName.toLowerCase().includes(q) ||
      g.commodityName.toLowerCase().includes(q) ||
      (Boolean(g.storageMark) && g.storageMark!.toLowerCase().includes(q)) ||
      (Boolean(g.partyMark) && g.partyMark!.toLowerCase().includes(q)) ||
      (Boolean(g.chamber) && g.chamber.toLowerCase().includes(q)) ||
      (Boolean(g.remarks) && g.remarks!.toLowerCase().includes(q)),
  );
}

/**
 * Extracts merged source GRN references from surviving GRN remarks (e.g. from GRN 0001 or multi-source 0010, 0012).
 */
export function parseMergedSourceGrns(remarks?: string | null): string | null {
  if (!remarks) return null;
  // Match "from <sources>" up to "into", ". Carried", ". Reason", "]" or end of string
  const fromPartMatch = remarks.match(/from\s+([^\]]+?)(?:\s+into|\.\s+Carried|\.\s+Reason|\]|$)/i);
  if (!fromPartMatch) {
    const fallbackMatch = remarks.match(/from (?:GRN\s+)?([A-Za-z0-9-]+)/i);
    return fallbackMatch ? fallbackMatch[1] : null;
  }
  const fromSection = fromPartMatch[1];
  // Extract all GRN numbers (e.g. "GRN 0010", "GRN 0012" or comma-separated tokens)
  const grnMatches = Array.from(fromSection.matchAll(/GRN\s+([A-Za-z0-9-]+)/gi)).map((m) => m[1]);
  if (grnMatches.length > 0) {
    const unique = Array.from(new Set(grnMatches));
    return unique.join(', ');
  }
  // If no explicit "GRN ####" was found, extract standalone identifier after "from"
  const single = fromSection.match(/(?:GRNs?\s+)?([A-Za-z0-9-]+)/i);
  return single ? single[1] : null;
}

/**
 * Extracts merged added bag count from remarks (e.g. "+60 bags" in "[MERGE RECEIVED: +60 bags...]").
 */
export function parseMergedAddedBags(remarks?: string | null): number | null {
  if (!remarks) return null;
  const match = remarks.match(/\+(\d+)\s+bags/i);
  return match ? parseInt(match[1], 10) : null;
}

/**
 * Extracts repacked bag composition from remarks (e.g. "Repacked: 30 S + 30 B = 60 bags" -> "30 Small, 30 Big").
 */
export function parseMergedRepackedDetail(remarks?: string | null): string | null {
  if (!remarks) return null;
  const match = remarks.match(/Repacked:\s*(\d+)\s*S\s*\+\s*(\d+)\s*B/i);
  if (match) {
    return `${match[1]} Small, ${match[2]} Big`;
  }
  return null;
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
  if (grn.status === 'CLOSED' || Boolean(grn.mergedIntoGrnId)) return 0;
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

export { clampBagAllocation } from '@cold-storage/contracts';

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
