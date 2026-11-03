import React, { useMemo } from 'react';
import {
  isHybridBagCategory,
  resolveOutwardRates,
  shouldEvaluateSeasonalBreakdown,
  toExcludedPeriodKeys,
  type BagType,
  type GrnInventorySummary,
  type OutwardBagCategory,
  type RentSummaryDto,
  type RentType,
} from '@cold-storage/contracts';
import type { GrnWithdrawal } from '../types';
import { clampBagAllocation } from '../hooks/eligibleGrn.helper';
import styles from './DeliveryBagCompositionFields.module.css';
import { OutwardRentBreakdown } from './OutwardRentBreakdown';
import { DeliveryHybridFields } from './DeliveryHybridFields';
import { DeliveryStandardSbFields } from './DeliveryStandardSbFields';

interface DeliveryBagCompositionFieldsProps {
  summary: GrnInventorySummary;
  bagType: BagType;
  rentType: RentType;
  rentMonths?: number | null;
  smallBagPrice?: number | null;
  bigBagPrice?: number | null;
  bagPrice?: number | null;
  manualBagPrice?: number | '';
  onManualBagPriceChange?: (value: number | '') => void;
  seasonalBagPrice?: number | '';
  monthlyBagPrice?: number | '';
  onSeasonalBagPriceChange?: (value: number | '') => void;
  onMonthlyBagPriceChange?: (value: number | '') => void;
  showSeasonalRate?: boolean;
  showMonthlyRate?: boolean;
  inwardDate?: Date | string | null;
  deliveryDate?: Date | string | null;
  seasonalRates?: { small: number; big: number } | null;
  monthlyRates?: { small: number; big: number } | null;
  withdrawal: GrnWithdrawal;
  bagCategory?: OutwardBagCategory;
  onQuantityChange?: (value: number | '') => void;
  onSmallBagsChange: (value: number | '') => void;
  onBigBagsChange: (value: number | '') => void;
  outwardRent?: number;
  fieldErrors?: Record<string, string>;
  onPayRent?: (account: RentSummaryDto) => void;
  canPayRent?: boolean;
  rentSummary?: RentSummaryDto | null;
  hamaliRate?: number | null;
}

export function DeliveryBagCompositionFields({
  summary,
  bagType,
  rentType,
  rentMonths,
  smallBagPrice,
  bigBagPrice,
  bagPrice,
  manualBagPrice,
  onManualBagPriceChange,
  seasonalBagPrice,
  monthlyBagPrice,
  onSeasonalBagPriceChange,
  onMonthlyBagPriceChange,
  showSeasonalRate,
  showMonthlyRate,
  inwardDate,
  deliveryDate,
  seasonalRates,
  monthlyRates,
  withdrawal,
  bagCategory,
  onQuantityChange,
  onSmallBagsChange,
  onBigBagsChange,
  outwardRent = 0,
  hamaliRate,
  fieldErrors = {},
  rentSummary,
}: DeliveryBagCompositionFieldsProps) {
  const { bags: bagsError, smallBags: smallError, bigBags: bigError } = fieldErrors;
  const availableTotal = summary.availableSmallBags + summary.availableBigBags;
  const isSegregated = summary.availableSmallBags > 0 && summary.availableBigBags > 0;
  const isHybrid = bagCategory ? isHybridBagCategory(bagCategory) : (bagType === 'Hybrid' || isHybridBagCategory(bagType));
  const isUnsegregatedSb = bagType === 'S/B' && !isSegregated;
  const isCombinedPool = isUnsegregatedSb;

  const smallQty = typeof withdrawal.smallBags === 'number' ? withdrawal.smallBags : 0;
  const bigQty = typeof withdrawal.bigBags === 'number' ? withdrawal.bigBags : 0;
  const hybridQty = typeof withdrawal.quantity === 'number' ? withdrawal.quantity : 0;
  const currentTotalWithdrawn = isHybrid ? hybridQty : smallQty + bigQty;
  const remainingStock = Math.max(0, availableTotal - currentTotalWithdrawn);

  const maxAllowedSmall = isCombinedPool
    ? Math.max(0, availableTotal - bigQty)
    : Math.min(summary.availableSmallBags, Math.max(0, availableTotal - bigQty));
  const maxAllowedBig = isCombinedPool
    ? Math.max(0, availableTotal - smallQty)
    : Math.min(summary.availableBigBags, Math.max(0, availableTotal - smallQty));

  const isSeasonalTransitioned = shouldEvaluateSeasonalBreakdown({
    rentType,
    inwardDate,
    deliveryDate,
    hasSeasonalRates: Boolean(seasonalRates?.small || seasonalRates?.big),
  });
  const rates = resolveOutwardRates(rentType, { smallBagPrice, bigBagPrice, bagPrice });
  const effectiveSeasonalRates = isSeasonalTransitioned && seasonalRates ? seasonalRates : rates;
  const effectiveMonthlyRates = monthlyRates ?? rates;
  const excludePeriodKeys = useMemo(
    () => toExcludedPeriodKeys(rentSummary?.extensions ?? []),
    [rentSummary?.extensions],
  );

  const handleSmallChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.trim();
    if (!val) {
      onSmallBagsChange('');
      return;
    }
    const parsed = parseInt(val, 10);
    if (!isNaN(parsed) && parsed >= 0) {
      const clamped = clampBagAllocation(
        parsed,
        bigQty,
        availableTotal,
        isCombinedPool ? undefined : summary.availableSmallBags,
      );
      onSmallBagsChange(clamped);
    }
  };

  const handleBigChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.trim();
    if (!val) {
      onBigBagsChange('');
      return;
    }
    const parsed = parseInt(val, 10);
    if (!isNaN(parsed) && parsed >= 0) {
      const clamped = clampBagAllocation(
        parsed,
        smallQty,
        availableTotal,
        isCombinedPool ? undefined : summary.availableBigBags,
      );
      onBigBagsChange(clamped);
    }
  };

  const handleQuantityChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.trim();
    if (!val) {
      onQuantityChange?.('');
      return;
    }
    const parsed = parseInt(val, 10);
    if (!isNaN(parsed) && parsed >= 0) onQuantityChange?.(Math.min(availableTotal, parsed));
  };

  const handleRateInput =
    (fn?: (v: number | '') => void) => (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = e.target.value.trim();
      if (!val) {
        fn?.('');
        return;
      }
      const parsed = parseFloat(val);
      if (!isNaN(parsed) && parsed >= 0) fn?.(parsed);
    };

  return (
    <>
      {isHybrid ? (
        <DeliveryHybridFields
          availableTotal={availableTotal}
          withdrawal={withdrawal}
          bagsError={bagsError}
          onQuantityChange={handleQuantityChange}
          showSeasonalRate={showSeasonalRate}
          showMonthlyRate={showMonthlyRate}
          seasonalBagPrice={seasonalBagPrice}
          monthlyBagPrice={monthlyBagPrice}
          manualBagPrice={manualBagPrice}
          onRateInput={handleRateInput}
          onSeasonalBagPriceChange={onSeasonalBagPriceChange}
          onMonthlyBagPriceChange={onMonthlyBagPriceChange}
          onManualBagPriceChange={onManualBagPriceChange}
          fieldErrors={fieldErrors}
          remainingStock={remainingStock}
        />
      ) : (
        <DeliveryStandardSbFields
          summary={summary}
          rentType={isSeasonalTransitioned ? 'Seasonal' : rentType}
          rates={effectiveSeasonalRates}
          availableTotal={availableTotal}
          maxAllowedSmall={maxAllowedSmall}
          maxAllowedBig={maxAllowedBig}
          isCombinedPool={isCombinedPool}
          withdrawal={withdrawal}
          bagsError={bagsError}
          smallError={smallError}
          bigError={bigError}
          onSmallChange={handleSmallChange}
          onBigChange={handleBigChange}
          remainingStock={remainingStock}
        />
      )}

      {bagsError && !smallError && !bigError && !isHybrid && (
        <span id="delivery-bags-error" className={styles.fieldErrorText} role="alert">
          {bagsError}
        </span>
      )}

      <OutwardRentBreakdown
        rentType={rentType}
        inwardDate={inwardDate}
        deliveryDate={deliveryDate || new Date().toISOString().split('T')[0]}
        smallBags={isHybrid ? hybridQty : smallQty}
        bigBags={isHybrid ? 0 : bigQty}
        bagType={isHybrid ? 'Hybrid' : bagType}
        bagCategory={bagCategory}
        bagPrice={isHybrid ? (typeof manualBagPrice === 'number' ? manualBagPrice : bagPrice) : undefined}
        seasonalBagPrice={isHybrid && typeof seasonalBagPrice === 'number' ? seasonalBagPrice : undefined}
        monthlyBagPrice={isHybrid && typeof monthlyBagPrice === 'number' ? monthlyBagPrice : undefined}
        seasonalRates={effectiveSeasonalRates}
        monthlyRates={effectiveMonthlyRates}
        rentMonths={rentMonths}
        totalRent={outwardRent}
        remainingStock={remainingStock}
        totalStock={availableTotal}
        hamaliRate={hamaliRate}
        excludePeriodKeys={excludePeriodKeys}
      />
    </>
  );
}
