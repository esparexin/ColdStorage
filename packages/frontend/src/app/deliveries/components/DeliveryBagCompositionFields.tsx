import React from 'react';
import {
  isHybridBagCategory, resolveOutwardRates, type BagType, type GrnInventorySummary, type OutwardBagCategory, type RentSummaryDto, type RentType,
} from '@cold-storage/contracts';
import type { GrnWithdrawal } from '../types';
import { calculateRemainingStock, clampBagAllocation } from '../hooks/eligibleGrn.helper';
import pageStyles from '../page.module.css';
import styles from './DeliveryBagCompositionFields.module.css';
import { OutwardRentBreakdown } from './OutwardRentBreakdown';

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
  paymentAmount?: number | '';
  paymentMode?: 'Cash' | 'UPI';
  onPaymentAmountChange?: (value: number | '') => void;
  onPaymentModeChange?: (mode: 'Cash' | 'UPI') => void;
}

export function DeliveryBagCompositionFields({
  summary, bagType, rentType, rentMonths, smallBagPrice, bigBagPrice, bagPrice,
  manualBagPrice, onManualBagPriceChange, seasonalBagPrice, monthlyBagPrice,
  onSeasonalBagPriceChange, onMonthlyBagPriceChange, showSeasonalRate, showMonthlyRate,
  inwardDate, deliveryDate, monthlyRates,
  withdrawal, bagCategory, onQuantityChange, onSmallBagsChange, onBigBagsChange,
  outwardRent = 0, rentSummary,
  fieldErrors = {},
}: DeliveryBagCompositionFieldsProps) {
  const { bags: bagsError, smallBags: smallError, bigBags: bigError } = fieldErrors;
  const availableTotal = summary.availableSmallBags + summary.availableBigBags;
  const isSbLot = bagType === 'S+B' || bagType === 'S/B';
  const isSegregated = summary.availableSmallBags > 0 && summary.availableBigBags > 0;
  const isHybrid = isHybridBagCategory(bagCategory);
  const isCombinedPool = (isSbLot || isHybrid) && !isSegregated;

  const smallQty = typeof withdrawal.smallBags === 'number' ? withdrawal.smallBags : 0;
  const bigQty = typeof withdrawal.bigBags === 'number' ? withdrawal.bigBags : 0;
  const hybridQty = typeof withdrawal.quantity === 'number' ? withdrawal.quantity : 0;
  const remainingStock = isHybrid
    ? Math.max(0, availableTotal - hybridQty)
    : calculateRemainingStock(availableTotal, smallQty, bigQty);

  const maxAllowedSmall = isCombinedPool
    ? Math.max(0, availableTotal - bigQty)
    : Math.min(summary.availableSmallBags, Math.max(0, availableTotal - bigQty));
  const maxAllowedBig = isCombinedPool
    ? Math.max(0, availableTotal - smallQty)
    : Math.min(summary.availableBigBags, Math.max(0, availableTotal - smallQty));

  const rates = resolveOutwardRates(rentType, { smallBagPrice, bigBagPrice, bagPrice });

  const handleSmallChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.trim();
    if (!val) { onSmallBagsChange(''); return; }
    const parsed = parseInt(val, 10);
    if (!isNaN(parsed) && parsed >= 0) {
      onSmallBagsChange(clampBagAllocation(parsed, bigQty, availableTotal, isCombinedPool ? undefined : summary.availableSmallBags));
    }
  };

  const handleBigChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.trim();
    if (!val) { onBigBagsChange(''); return; }
    const parsed = parseInt(val, 10);
    if (!isNaN(parsed) && parsed >= 0) {
      onBigBagsChange(clampBagAllocation(parsed, smallQty, availableTotal, isCombinedPool ? undefined : summary.availableBigBags));
    }
  };

  const handleQuantityChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.trim();
    if (!val) { onQuantityChange?.(''); return; }
    const parsed = parseInt(val, 10);
    if (!isNaN(parsed) && parsed >= 0) onQuantityChange?.(Math.min(availableTotal, parsed));
  };

  const handleRateInput = (fn?: (v: number | '') => void) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.trim();
    if (!val) { fn?.(''); return; }
    const parsed = parseFloat(val);
    if (!isNaN(parsed) && parsed >= 0) fn?.(parsed);
  };

  const hybridColCount = showSeasonalRate && showMonthlyRate ? 4 : 3;
  const hybridGridClass = hybridColCount === 4 ? styles.hybridGrid4 : styles.hybridGrid3;

  return (
    <>
      {isHybrid ? (
        <div className={hybridGridClass}>
          <div className={pageStyles.fieldGroup}>
            <div className={styles.labelRow}>
              <label htmlFor="delivery-quantity-bags" className={styles.labelTitle}>Hybrid Bags</label>
            </div>
            <input
              id="delivery-quantity-bags" type="number" inputMode="numeric" min={1} max={availableTotal} placeholder="0"
              className={`${pageStyles.fieldInput} ${bagsError ? styles.inputError : ''}`}
              value={withdrawal.quantity ?? ''} aria-invalid={Boolean(bagsError)}
              aria-describedby={bagsError ? 'delivery-quantity-error' : undefined} onChange={handleQuantityChange}
            />
            {bagsError && <span id="delivery-quantity-error" className={styles.fieldErrorText} role="alert">{bagsError}</span>}
          </div>

          {showSeasonalRate && (
            <div className={pageStyles.fieldGroup}>
              <div className={styles.labelRow}>
                <label htmlFor="delivery-seasonal-rate" className={styles.labelTitle}>Seasonal Rate (₹/bag)</label>
              </div>
              <input
                id="delivery-seasonal-rate" type="number" inputMode="decimal" min={0} placeholder="0.00"
                className={`${pageStyles.fieldInput} ${fieldErrors.seasonalBagPrice ? styles.inputError : ''}`}
                value={seasonalBagPrice ?? ''} aria-invalid={Boolean(fieldErrors.seasonalBagPrice)}
                aria-describedby={fieldErrors.seasonalBagPrice ? 'delivery-seasonal-rate-error' : undefined}
                onChange={handleRateInput(onSeasonalBagPriceChange)}
              />
              {fieldErrors.seasonalBagPrice && <span id="delivery-seasonal-rate-error" className={styles.fieldErrorText} role="alert">{fieldErrors.seasonalBagPrice}</span>}
            </div>
          )}

          {showMonthlyRate && (
            <div className={pageStyles.fieldGroup}>
              <div className={styles.labelRow}>
                <label htmlFor="delivery-monthly-rate" className={styles.labelTitle}>Monthly Rate (₹/bag)</label>
              </div>
              <input
                id="delivery-monthly-rate" type="number" inputMode="decimal" min={0} placeholder="0.00"
                className={`${pageStyles.fieldInput} ${fieldErrors.monthlyBagPrice ? styles.inputError : ''}`}
                value={monthlyBagPrice ?? ''} aria-invalid={Boolean(fieldErrors.monthlyBagPrice)}
                aria-describedby={fieldErrors.monthlyBagPrice ? 'delivery-monthly-rate-error' : undefined}
                onChange={handleRateInput(onMonthlyBagPriceChange)}
              />
              {fieldErrors.monthlyBagPrice && <span id="delivery-monthly-rate-error" className={styles.fieldErrorText} role="alert">{fieldErrors.monthlyBagPrice}</span>}
            </div>
          )}

          {!showSeasonalRate && !showMonthlyRate && (
            <div className={pageStyles.fieldGroup}>
              <div className={styles.labelRow}>
                <label htmlFor="delivery-bag-price" className={styles.labelTitle}>Each Bag Price (₹)</label>
              </div>
              <input
                id="delivery-bag-price" type="number" inputMode="decimal" min={0} placeholder="0.00"
                className={`${pageStyles.fieldInput} ${fieldErrors.bagPrice ? styles.inputError : ''}`}
                value={manualBagPrice ?? ''} aria-invalid={Boolean(fieldErrors.bagPrice)}
                aria-describedby={fieldErrors.bagPrice ? 'delivery-bag-price-error' : undefined}
                onChange={handleRateInput(onManualBagPriceChange)}
              />
              {fieldErrors.bagPrice && <span id="delivery-bag-price-error" className={styles.fieldErrorText} role="alert">{fieldErrors.bagPrice}</span>}
            </div>
          )}

          <div className={pageStyles.fieldGroup}>
            <div className={styles.labelRow}><span className={styles.labelTitle}>Bal. Bags</span></div>
            <div className={styles.balanceDisplay} id="delivery-balance-bags-display">
              <span className={styles.balanceText}>{remainingStock.toLocaleString('en-IN')} / {availableTotal.toLocaleString('en-IN')}</span>
            </div>
          </div>
        </div>
      ) : (
        <div className={styles.compositionGrid}>
          <div className={pageStyles.fieldGroup}>
            <div className={styles.labelRow}>
              <label htmlFor="delivery-small-bags" className={styles.labelTitle}>Small Bags</label>
              <span className={styles.rateText}>Rate: ₹{rates.small}/bag</span>
            </div>
            <input
              id="delivery-small-bags" type="number" inputMode="numeric" min={0} max={maxAllowedSmall} placeholder="0"
              className={`${pageStyles.fieldInput} ${bagsError || smallError ? styles.inputError : ''}`}
              value={withdrawal.smallBags} aria-invalid={Boolean(bagsError || smallError)}
              aria-describedby={smallError ? 'delivery-small-error' : undefined} onChange={handleSmallChange}
            />
            {smallError && <span id="delivery-small-error" className={styles.fieldErrorText} role="alert">{smallError}</span>}
          </div>

          <div className={pageStyles.fieldGroup}>
            <div className={styles.labelRow}>
              <label htmlFor="delivery-big-bags" className={styles.labelTitle}>Big Bags</label>
              <span className={styles.rateText}>Rate: ₹{rates.big}/bag</span>
            </div>
            <input
              id="delivery-big-bags" type="number" inputMode="numeric" min={0} max={maxAllowedBig} placeholder="0"
              className={`${pageStyles.fieldInput} ${bagsError || bigError ? styles.inputError : ''}`}
              value={withdrawal.bigBags} aria-invalid={Boolean(bagsError || bigError)}
              aria-describedby={bigError ? 'delivery-big-error' : undefined} onChange={handleBigChange}
            />
            {bigError && <span id="delivery-big-error" className={styles.fieldErrorText} role="alert">{bigError}</span>}
          </div>

          <div className={pageStyles.fieldGroup}>
            <div className={styles.labelRow}><span className={styles.labelTitle}>Bal. Bags</span></div>
            <div className={styles.balanceDisplay} id="delivery-balance-sb-display">
              <span className={styles.balanceText}>{remainingStock.toLocaleString('en-IN')} / {availableTotal.toLocaleString('en-IN')}</span>
            </div>
          </div>
        </div>
      )}

      {bagsError && !smallError && !bigError && !isHybrid && (
        <span id="delivery-bags-error" className={styles.fieldErrorText} role="alert">{bagsError}</span>
      )}

      <OutwardRentBreakdown
        rentType={rentType}
        inwardDate={inwardDate}
        deliveryDate={deliveryDate || new Date().toISOString().split('T')[0]}
        smallBags={isHybrid ? hybridQty : smallQty}
        bigBags={isHybrid ? 0 : bigQty}
        bagCategory={bagCategory}
        bagPrice={typeof manualBagPrice === 'number' ? manualBagPrice : bagPrice}
        seasonalBagPrice={typeof seasonalBagPrice === 'number' ? seasonalBagPrice : undefined}
        monthlyBagPrice={typeof monthlyBagPrice === 'number' ? monthlyBagPrice : undefined}
        seasonalRates={rates}
        monthlyRates={monthlyRates ?? rates}
        rentMonths={rentMonths}
        totalRent={outwardRent}
        pendingBalance={rentSummary?.remainingBalance}
        remainingStock={remainingStock}
        totalStock={availableTotal}
      />
    </>
  );
}
