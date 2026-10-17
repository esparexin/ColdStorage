import { seasonYearForInwardDate, type Grn, type RentType } from '@cold-storage/contracts';

export interface MergeEligibility {
  eligibleSources: Grn[];
  futureSeasonCount: number;
}

/**
 * Splits open GRNs into merge-eligible sources vs future-season exclusions.
 * Excludes sources with mismatched commodity or rent type, loan holds,
 * zero balance, and sources from future seasons relative to the target.
 */
export function partitionMergeSources(
  openGrns: Grn[],
  targetGrnId: string,
  targetSeason: number,
  targetCommodityId?: string,
  targetRentType?: RentType,
): MergeEligibility {
  const eligibleSources: Grn[] = [];
  let futureSeasonCount = 0;
  for (const g of openGrns) {
    if (g.id === targetGrnId || (g.closingBags ?? g.bags) <= 0 || g.loanStatus === 'TAKEN') continue;
    if (targetCommodityId && g.commodityId !== targetCommodityId) continue;
    if (targetRentType && g.rentType !== targetRentType) continue;
    if (seasonYearForInwardDate(g.date) > targetSeason) { futureSeasonCount += 1; continue; }
    eligibleSources.push(g);
  }
  return { eligibleSources, futureSeasonCount };
}

