'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type {
  ConfirmedDispatchAllocation,
  DeliveryChallan,
  Grn,
  OperationalBagType,
  RentSummaryDto,
  RentType,
  UnclassifiedDispatchAllocation,
} from '@cold-storage/contracts';
import { deriveHybridRateVisibility, parseMergedConsignmentBreakdown } from '@cold-storage/contracts';
import { requestWithAuth } from '@/lib/api-client';
import { calculateRemainingMergedStockPools, type MergedStockPools } from './mergedStockPools.helper';
import { computeOutwardRentCharge } from './deliveryRent.helper';

export interface UseDualSectionDeliveryParams {
  facilityId: string;
  selectedGrn: Grn | null;
  rentSummary: RentSummaryDto | null;
  createDate: string;
  billableRentMonths: number;
  seasonalCommodityRates: { small: number; big: number } | null;
  monthlyCommodityRates: { small: number; big: number } | null;
}

function computePoolRent(params: {
  rentType: RentType; bagType: OperationalBagType; small: number; big: number; qty?: number;
  seasonalPrice: number | ''; monthlyPrice: number | ''; months: number;
  grn: Grn | null; date: string; sRates: { small: number; big: number } | null; mRates: { small: number; big: number } | null;
}) {
  const isHybrid = params.bagType === 'Hybrid';
  return computeOutwardRentCharge({
    rentType: params.rentType, bagType: params.bagType, bagCategory: isHybrid ? 'Hybrid' : 'S/B',
    smallBags: isHybrid ? 0 : params.small, bigBags: isHybrid ? 0 : params.big, quantity: isHybrid ? params.qty : undefined,
    seasonalBagPrice: typeof params.seasonalPrice === 'number' ? params.seasonalPrice : undefined,
    monthlyBagPrice: typeof params.monthlyPrice === 'number' ? params.monthlyPrice : undefined,
    rentMonths: params.months, inwardDate: params.grn?.date, deliveryDate: params.date,
    smallBagPrice: params.grn?.smallBagPrice ?? (params.rentType === 'Monthly' ? params.mRates?.small : params.sRates?.small),
    bigBagPrice: params.grn?.bigBagPrice ?? (params.rentType === 'Monthly' ? params.mRates?.big : params.sRates?.big),
    bagPrice: params.grn?.bagPrice,
  });
}

export function useDualSectionDelivery(params: UseDualSectionDeliveryParams) {
  const { facilityId, selectedGrn, rentSummary, createDate, billableRentMonths, seasonalCommodityRates, monthlyCommodityRates } = params;

  const [priorDeliveries, setPriorDeliveries] = useState<DeliveryChallan[]>([]);
  const [loadingDeliveries, setLoadingDeliveries] = useState(false);

  // Section A: Unclassified bags state (bagType starts unselected '')
  const [unclassifiedBagType, setUnclassifiedBagType] = useState<OperationalBagType | ''>('');
  const [unclassifiedQty, setUnclassifiedQty] = useState<number | ''>('');
  const [unclassifiedSmall, setUnclassifiedSmall] = useState<number | ''>('');
  const [unclassifiedBig, setUnclassifiedBig] = useState<number | ''>('');
  const [unclassifiedSeasonalPrice, setUnclassifiedSeasonalPrice] = useState<number | ''>('');
  const [unclassifiedMonthlyPrice, setUnclassifiedMonthlyPrice] = useState<number | ''>('');

  // Section B: Confirmed bags state
  const [confirmedSmall, setConfirmedSmall] = useState<number | ''>('');
  const [confirmedBig, setConfirmedBig] = useState<number | ''>('');
  const [confirmedQty, setConfirmedQty] = useState<number | ''>('');
  const [confirmedSeasonalPrice, setConfirmedSeasonalPrice] = useState<number | ''>('');
  const [confirmedMonthlyPrice, setConfirmedMonthlyPrice] = useState<number | ''>('');

  useEffect(() => {
    setUnclassifiedBagType(''); setUnclassifiedQty(''); setUnclassifiedSmall(''); setUnclassifiedBig('');
    setUnclassifiedSeasonalPrice(selectedGrn?.smallBagPrice ?? seasonalCommodityRates?.small ?? '');
    setUnclassifiedMonthlyPrice(monthlyCommodityRates?.small ?? '');
    setConfirmedSmall(''); setConfirmedBig(''); setConfirmedQty('');
    setConfirmedSeasonalPrice(selectedGrn?.smallBagPrice ?? seasonalCommodityRates?.small ?? '');
    setConfirmedMonthlyPrice(monthlyCommodityRates?.small ?? '');
  }, [selectedGrn?.id, seasonalCommodityRates, monthlyCommodityRates, selectedGrn?.smallBagPrice]);

  const fetchPriorDeliveries = useCallback(async () => {
    if (!facilityId || !selectedGrn?.id) { setPriorDeliveries([]); return; }
    setLoadingDeliveries(true);
    try {
      const res = await requestWithAuth(`/api/facilities/${encodeURIComponent(facilityId)}/grns/${encodeURIComponent(selectedGrn.id)}/deliveries`);
      if (res.ok) {
        const data = (await res.json()) as { deliveries: DeliveryChallan[] };
        setPriorDeliveries(data.deliveries ?? []);
      }
    } catch { setPriorDeliveries([]); } finally { setLoadingDeliveries(false); }
  }, [facilityId, selectedGrn?.id]);

  useEffect(() => { void fetchPriorDeliveries(); }, [fetchPriorDeliveries]);

  const breakdown = useMemo(() => {
    if (!selectedGrn) return null;
    return rentSummary?.mergedConsignment ?? parseMergedConsignmentBreakdown(selectedGrn.remarks, selectedGrn.bags, selectedGrn.customerName);
  }, [selectedGrn, rentSummary]);

  const pools = useMemo<MergedStockPools | null>(() => calculateRemainingMergedStockPools(breakdown, priorDeliveries), [breakdown, priorDeliveries]);
  const isDualSection = Boolean(pools && pools.initialUnclassified > 0 && pools.availableConfirmedTotal > 0);
  const rateVisibility = useMemo(
    () => deriveHybridRateVisibility({
      rentType: selectedGrn?.rentType,
      inwardDate: selectedGrn?.date,
      deliveryDate: createDate,
    }),
    [selectedGrn?.rentType, selectedGrn?.date, createDate],
  );

  const isHybridSecA = unclassifiedBagType === 'Hybrid';
  const uSmallNum = typeof unclassifiedSmall === 'number' ? unclassifiedSmall : 0;
  const uBigNum = typeof unclassifiedBig === 'number' ? unclassifiedBig : 0;
  const uQtyNum = typeof unclassifiedQty === 'number' ? unclassifiedQty : 0;
  const effectiveUnclassifiedBags = isHybridSecA ? uQtyNum : (unclassifiedBagType === 'S/B' ? uSmallNum + uBigNum : 0);
  const remainingUnclassifiedStock = Math.max(0, (pools?.availableUnclassified ?? 0) - effectiveUnclassifiedBags);

  const isHybridSecB = pools?.confirmedBagType === 'Hybrid';
  const cSmallNum = typeof confirmedSmall === 'number' ? confirmedSmall : 0;
  const cBigNum = typeof confirmedBig === 'number' ? confirmedBig : 0;
  const cQtyNum = typeof confirmedQty === 'number' ? confirmedQty : 0;
  const effectiveConfirmedBags = isHybridSecB ? cQtyNum : cSmallNum + cBigNum;
  const remainingConfirmedSmall = Math.max(0, (pools?.availableConfirmedSmall ?? 0) - cSmallNum);
  const remainingConfirmedBig = Math.max(0, (pools?.availableConfirmedBig ?? 0) - cBigNum);
  const remainingConfirmedHybrid = Math.max(0, (pools?.availableConfirmedHybrid ?? 0) - cQtyNum);

  const totalWithdrawingBags = effectiveUnclassifiedBags + effectiveConfirmedBags;
  const overallRemainingStock = Math.max(0, (pools?.totalAvailable ?? 0) - totalWithdrawingBags);
  const rentType = selectedGrn?.rentType ?? 'Seasonal';

  const unclassifiedRent = useMemo(() => {
    if (effectiveUnclassifiedBags <= 0 || !unclassifiedBagType) return 0;
    return computePoolRent({
      rentType, bagType: unclassifiedBagType === 'Hybrid' ? 'Hybrid' : 'S/B',
      small: uSmallNum, big: uBigNum, qty: uQtyNum, seasonalPrice: unclassifiedSeasonalPrice,
      monthlyPrice: unclassifiedMonthlyPrice, months: billableRentMonths, grn: selectedGrn,
      date: createDate, sRates: seasonalCommodityRates, mRates: monthlyCommodityRates,
    });
  }, [effectiveUnclassifiedBags, unclassifiedBagType, rentType, uSmallNum, uBigNum, uQtyNum, unclassifiedSeasonalPrice, unclassifiedMonthlyPrice, billableRentMonths, selectedGrn, createDate, seasonalCommodityRates, monthlyCommodityRates]);

  const confirmedRent = useMemo(() => {
    if (effectiveConfirmedBags <= 0 || !pools) return 0;
    return computePoolRent({
      rentType, bagType: pools.confirmedBagType, small: cSmallNum, big: cBigNum, qty: cQtyNum,
      seasonalPrice: confirmedSeasonalPrice, monthlyPrice: confirmedMonthlyPrice,
      months: billableRentMonths, grn: selectedGrn, date: createDate,
      sRates: seasonalCommodityRates, mRates: monthlyCommodityRates,
    });
  }, [effectiveConfirmedBags, pools, rentType, cSmallNum, cBigNum, cQtyNum, confirmedSeasonalPrice, confirmedMonthlyPrice, billableRentMonths, selectedGrn, createDate, seasonalCommodityRates, monthlyCommodityRates]);

  const totalOutwardRent = Number((unclassifiedRent + confirmedRent).toFixed(2));

  const sectionAErrors: Record<string, string> = {};
  if (effectiveUnclassifiedBags > 0) {
    if (!unclassifiedBagType) sectionAErrors.bagType = 'Select Bag Type for Section A';
    if (effectiveUnclassifiedBags > (pools?.availableUnclassified ?? 0)) sectionAErrors.quantity = `Exceeds unclassified stock of ${pools?.availableUnclassified ?? 0}`;
    if (unclassifiedBagType === 'S/B' && typeof unclassifiedQty === 'number' && (uSmallNum + uBigNum !== unclassifiedQty)) {
      sectionAErrors.sum = `Small (${uSmallNum}) + Big (${uBigNum}) must equal quantity (${unclassifiedQty})`;
    }
  }

  const sectionBErrors: Record<string, string> = {};
  if (effectiveConfirmedBags > 0 && pools) {
    if (isHybridSecB && cQtyNum > pools.availableConfirmedHybrid) sectionBErrors.quantity = `Exceeds confirmed hybrid stock of ${pools.availableConfirmedHybrid}`;
    if (!isHybridSecB) {
      if (cSmallNum > pools.availableConfirmedSmall) sectionBErrors.smallBags = `Exceeds confirmed small stock of ${pools.availableConfirmedSmall}`;
      if (cBigNum > pools.availableConfirmedBig) sectionBErrors.bigBags = `Exceeds confirmed big stock of ${pools.availableConfirmedBig}`;
    }
  }

  const isDualSectionValid = Boolean(
    totalWithdrawingBags > 0 && totalWithdrawingBags <= (pools?.totalAvailable ?? 0) &&
    Object.keys(sectionAErrors).length === 0 && Object.keys(sectionBErrors).length === 0,
  );

  const buildAllocations = (): { unclassifiedDispatch?: UnclassifiedDispatchAllocation; confirmedDispatch?: ConfirmedDispatchAllocation } => {
    let unclassifiedDispatch: UnclassifiedDispatchAllocation | undefined;
    let confirmedDispatch: ConfirmedDispatchAllocation | undefined;
    if (effectiveUnclassifiedBags > 0 && unclassifiedBagType) {
      unclassifiedDispatch = {
        bagType: unclassifiedBagType, quantity: effectiveUnclassifiedBags,
        smallBags: isHybridSecA ? 0 : uSmallNum, bigBags: isHybridSecA ? 0 : uBigNum,
        seasonalBagPrice: typeof unclassifiedSeasonalPrice === 'number' ? unclassifiedSeasonalPrice : undefined,
        monthlyBagPrice: typeof unclassifiedMonthlyPrice === 'number' ? unclassifiedMonthlyPrice : undefined,
      };
    }
    if (effectiveConfirmedBags > 0 && pools) {
      confirmedDispatch = {
        bagType: pools.confirmedBagType, quantity: effectiveConfirmedBags,
        smallBags: isHybridSecB ? 0 : cSmallNum, bigBags: isHybridSecB ? 0 : cBigNum,
        seasonalBagPrice: typeof confirmedSeasonalPrice === 'number' ? confirmedSeasonalPrice : undefined,
        monthlyBagPrice: typeof confirmedMonthlyPrice === 'number' ? confirmedMonthlyPrice : undefined,
      };
    }
    return { unclassifiedDispatch, confirmedDispatch };
  };

  return {
    isDualSection, pools, loadingDeliveries, unclassifiedBagType, setUnclassifiedBagType,
    unclassifiedQty, setUnclassifiedQty, unclassifiedSmall, setUnclassifiedSmall, unclassifiedBig, setUnclassifiedBig,
    unclassifiedSeasonalPrice, setUnclassifiedSeasonalPrice, unclassifiedMonthlyPrice, setUnclassifiedMonthlyPrice,
    unclassifiedRent, effectiveUnclassifiedBags, remainingUnclassifiedStock,
    confirmedSmall, setConfirmedSmall, confirmedBig, setConfirmedBig, confirmedQty, setConfirmedQty,
    confirmedSeasonalPrice, setConfirmedSeasonalPrice, confirmedMonthlyPrice, setConfirmedMonthlyPrice,
    confirmedRent, effectiveConfirmedBags, remainingConfirmedSmall, remainingConfirmedBig, remainingConfirmedHybrid,
    totalWithdrawingBags, totalOutwardRent, overallRemainingStock, sectionAErrors, sectionBErrors, isDualSectionValid, buildAllocations, rateVisibility,
  };
}
