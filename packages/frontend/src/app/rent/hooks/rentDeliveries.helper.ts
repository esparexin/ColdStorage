import {
  seasonYearForInwardDate,
  type DeliveryChallan,
} from '@cold-storage/contracts';

export type OutwardBagCategory = 'Small' | 'Big' | 'Small & Big';

export function categorizeOutwardBags(smallBags: number, bigBags: number): OutwardBagCategory {
  if (smallBags > 0 && bigBags === 0) return 'Small';
  if (bigBags > 0 && smallBags === 0) return 'Big';
  return 'Small & Big';
}

export function formatOutwardBagBreakdown(smallBags: number, bigBags: number): string {
  const category = categorizeOutwardBags(smallBags, bigBags);
  const total = smallBags + bigBags;
  if (category === 'Small') {
    return `${total.toLocaleString('en-IN')} Small bags`;
  }
  if (category === 'Big') {
    return `${total.toLocaleString('en-IN')} Big bags`;
  }
  return `${total.toLocaleString('en-IN')} bags (${smallBags.toLocaleString('en-IN')} S + ${bigBags.toLocaleString('en-IN')} B)`;
}

export function deriveOutwardPeriodLabel(
  inwardDate: Date | string,
  deliveryDate: Date | string,
): string {
  const inD = new Date(inwardDate);
  const delD = new Date(deliveryDate);
  const originSeason = seasonYearForInwardDate(inD);
  const delMonth = delD.getMonth(); // 0 = Jan, 1 = Feb
  const delYear = delD.getFullYear();

  if (delYear === originSeason + 1 && delMonth === 0) {
    return `January ${delYear} Extension`;
  }
  if (delYear === originSeason + 1 && delMonth === 1) {
    return `February ${delYear} Extension`;
  }
  if (delYear > originSeason) {
    return `Season ${delYear} Renewal`;
  }
  return `Season ${originSeason}`;
}

export interface OutwardRentSummaryMetrics {
  totalRent: number;
  totalBags: number;
  smallBags: number;
  bigBags: number;
  issuedCount: number;
  reversedCount: number;
}

export function summarizeOutwardRent(deliveries: DeliveryChallan[]): OutwardRentSummaryMetrics {
  let totalRent = 0;
  let totalBags = 0;
  let smallBags = 0;
  let bigBags = 0;
  let issuedCount = 0;
  let reversedCount = 0;

  for (const d of deliveries) {
    if (d.status === 'ISSUED') {
      issuedCount += 1;
      totalRent += d.rentCharge ?? 0;
      totalBags += d.totalBags;
      smallBags += d.smallBags;
      bigBags += d.bigBags;
    } else if (d.status === 'REVERSED') {
      reversedCount += 1;
    }
  }

  return {
    totalRent: Number(totalRent.toFixed(2)),
    totalBags,
    smallBags,
    bigBags,
    issuedCount,
    reversedCount,
  };
}

export interface MergedGrnNote {
  id: string;
  title: string;
  date: string;
  bags: number;
  repackedDetail?: string;
  source: string;
  carriedRent: number;
  reason: string;
}

export function parseMergedGrnNotes(remarks?: string | null): MergedGrnNote[] {
  if (!remarks) return [];
  const mergeRx =
    /\[MERGE RECEIVED on ([^:]+):\s*\+?(\d+)\s*bags(?:\s*\(([^)]*)\))?\s*from\s+([^.]+)\.(?:[^.]*Carried pending rent:\s*₹?(\d+)\.)?\s*Reason:\s*([^\]]+)\]/gi;
  const notes: MergedGrnNote[] = [];
  let match: RegExpExecArray | null;
  while ((match = mergeRx.exec(remarks)) !== null) {
    const [, date, bagsStr, repacked, source, carriedRentStr, reason] = match;
    notes.push({
      id: `merge-${date.trim()}-${source.trim().replace(/\s+/g, '-')}`,
      title: 'Merged Stock Inward',
      date: date.trim(),
      bags: Number(bagsStr),
      repackedDetail: repacked ? repacked.trim() : undefined,
      source: source.trim(),
      carriedRent: carriedRentStr ? Number(carriedRentStr) : 0,
      reason: reason?.trim() || 'Internal Move / Merge',
    });
  }
  return notes;
}

