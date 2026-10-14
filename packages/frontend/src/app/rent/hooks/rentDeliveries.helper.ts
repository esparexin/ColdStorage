import {
  seasonYearForInwardDate,
  type DeliveryChallan,
  type OutwardBagCategory,
} from '@cold-storage/contracts';

// OutwardBagCategory is the contracts SSOT and was previously re-declared here
// with only 3 of its 8 values, so a Hybrid, Modern, Modern Size, Mixed or S/B
// delivery could not be represented at all. The local
// `categorizeOutwardBags` still returns the narrow subset it can actually
// derive from a bag composition; the TYPE is the full contract union.
export type { OutwardBagCategory };

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

export {
  parseMergedGrnNotes,
  type MergedGrnNote,
} from '../../grns/components/internalMovementNotes.helper';

