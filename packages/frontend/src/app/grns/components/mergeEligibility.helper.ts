import { seasonYearForInwardDate, type Grn } from '@cold-storage/contracts';

export interface MergeEligibility {
  eligibleSources: Grn[];
  futureSeasonCount: number;
}

/**
 * Splits open GRNs into merge-eligible sources vs future-season exclusions.
 * A source from a season after the target's can never merge (the backend
 * season guard stays authoritative); excluding it here keeps ineligible lots
 * from looking selectable. Zero-balance and loan-hold lots stay excluded too.
 */
export function partitionMergeSources(openGrns: Grn[], targetGrnId: string, targetSeason: number): MergeEligibility {
  const eligibleSources: Grn[] = [];
  let futureSeasonCount = 0;
  for (const g of openGrns) {
    if (g.id === targetGrnId || (g.closingBags ?? g.bags) <= 0 || g.loanStatus === 'TAKEN') continue;
    if (seasonYearForInwardDate(g.date) > targetSeason) { futureSeasonCount += 1; continue; }
    eligibleSources.push(g);
  }
  return { eligibleSources, futureSeasonCount };
}
