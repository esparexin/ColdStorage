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

/**
 * Finds the newest compatible open GRN when the selected target is from an earlier season.
 * Prefers the same customer, followed by any compatible open lot in the facility.
 */
export function findForwardMergeTarget(
  targetGrn: Grn,
  openGrns: Grn[],
): Grn | null {
  const targetSeason = seasonYearForInwardDate(targetGrn.date);
  const newerCandidates = openGrns.filter((g) => {
    if (g.id === targetGrn.id || (g.closingBags ?? g.bags) <= 0 || g.loanStatus === 'TAKEN') return false;
    if (targetGrn.commodityId && g.commodityId !== targetGrn.commodityId) return false;
    if (targetGrn.rentType && g.rentType !== targetGrn.rentType) return false;
    return seasonYearForInwardDate(g.date) > targetSeason;
  });

  if (newerCandidates.length === 0) return null;

  const sameCustomer = newerCandidates
    .filter((g) => g.customerId === targetGrn.customerId)
    .sort((a, b) => seasonYearForInwardDate(b.date) - seasonYearForInwardDate(a.date));

  if (sameCustomer.length > 0) return sameCustomer[0];

  return newerCandidates.sort((a, b) => seasonYearForInwardDate(b.date) - seasonYearForInwardDate(a.date))[0];
}

/**
 * Filters open GRNs to eligible surviving target candidates.
 * Candidates must have positive stock, no loan hold, and not be among currently selected sources.
 * When an initiating source lot is present, target candidates must match its commodity and rent type
 * and be from the same or later season.
 */
export function filterEligibleTargetGrns(
  openGrns: Grn[],
  currentGrn: Grn,
  selectedSourceIds: string[] = [],
  currentTargetId?: string,
  initiatingGrnId?: string,
): Grn[] {
  const initiatingGrn = initiatingGrnId ? openGrns.find((g) => g.id === initiatingGrnId) : undefined;
  const matchGrn = initiatingGrn ?? currentGrn;
  const minSeason = initiatingGrn ? seasonYearForInwardDate(initiatingGrn.date) : undefined;

  return openGrns.filter((g) => {
    if ((g.closingBags ?? g.bags) <= 0 || g.loanStatus === 'TAKEN') return false;
    if (selectedSourceIds.includes(g.id) && g.id !== currentTargetId) return false;
    if (matchGrn.commodityId && g.commodityId !== matchGrn.commodityId) return false;
    if (matchGrn.rentType && g.rentType !== matchGrn.rentType) return false;
    if (minSeason != null && seasonYearForInwardDate(g.date) < minSeason) return false;
    return true;
  });
}

/**
 * Resolves next selected source IDs when surviving target GRN changes.
 * Guarantees that the destination is never a source, preserves the initiating GRN as a source
 * when a different destination is selected, and prunes any sources from seasons later than the target.
 */
export function resolveNextSelectedSources(
  currentGrnId: string | undefined,
  newTargetId: string,
  prevSelectedIds: string[],
  openGrns: Grn[],
): string[] {
  const filtered = prevSelectedIds.filter((id) => id !== newTargetId);
  if (currentGrnId && newTargetId !== currentGrnId && !filtered.includes(currentGrnId)) {
    filtered.unshift(currentGrnId);
  }
  const newTarget = openGrns.find((g) => g.id === newTargetId);
  if (!newTarget) return filtered;
  const targetSeason = seasonYearForInwardDate(newTarget.date);
  return filtered.filter((id) => {
    const src = openGrns.find((g) => g.id === id);
    return src ? seasonYearForInwardDate(src.date) <= targetSeason : true;
  });
}

/**
 * Resolves initial merge state: preserves operator's selected target without silent switching,
 * while seeding the initiating source lot when one is provided.
 */
export function resolveInitialMergeState(
  currentGrn: Grn,
  openGrns: Grn[],
  initiatingGrnId?: string,
): { initialTargetId: string; initialSourceIds: string[] } {
  if (initiatingGrnId && initiatingGrnId !== currentGrn.id) {
    return {
      initialTargetId: currentGrn.id,
      initialSourceIds: [initiatingGrnId],
    };
  }
  return {
    initialTargetId: currentGrn.id,
    initialSourceIds: [],
  };
}


