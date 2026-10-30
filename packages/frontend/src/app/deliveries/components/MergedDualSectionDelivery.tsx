'use client';

import React from 'react';
import type { Grn, OperationalBagType } from '@cold-storage/contracts';
import { Badge, Select } from '@/components/ui';
import type { useDualSectionDelivery } from '../hooks/useDualSectionDelivery';
import { DualSectionRateFields } from './DualSectionRateFields';
import styles from './MergedDualSectionDelivery.module.css';

interface MergedDualSectionDeliveryProps {
  grn: Grn;
  dualSection: ReturnType<typeof useDualSectionDelivery>;
}

export function MergedDualSectionDelivery({ grn, dualSection }: MergedDualSectionDeliveryProps) {
  const {
    pools, unclassifiedBagType, setUnclassifiedBagType,
    unclassifiedQty, setUnclassifiedQty, unclassifiedSmall, setUnclassifiedSmall,
    unclassifiedBig, setUnclassifiedBig, unclassifiedRent, remainingUnclassifiedStock,
    unclassifiedSeasonalPrice, setUnclassifiedSeasonalPrice, unclassifiedMonthlyPrice, setUnclassifiedMonthlyPrice,
    confirmedSmall, setConfirmedSmall, confirmedBig, setConfirmedBig,
    confirmedQty, setConfirmedQty, confirmedRent,
    confirmedSeasonalPrice, setConfirmedSeasonalPrice, confirmedMonthlyPrice, setConfirmedMonthlyPrice,
    remainingConfirmedSmall, remainingConfirmedBig, remainingConfirmedHybrid,
    totalWithdrawingBags, totalOutwardRent, overallRemainingStock,
    sectionAErrors, sectionBErrors, rateVisibility,
  } = dualSection;

  if (!pools) return null;

  const isSbSecA = unclassifiedBagType === 'S/B';
  const isHybridSecA = unclassifiedBagType === 'Hybrid';
  const isHybridSecB = pools.confirmedBagType === 'Hybrid';
  const showSecASeasonal = isHybridSecA && rateVisibility.showSeasonalRate;
  const showSecAMonthly = isHybridSecA && rateVisibility.showMonthlyRate;
  const showSecBSeasonal = isHybridSecB && rateVisibility.showSeasonalRate;
  const showSecBMonthly = isHybridSecB && rateVisibility.showMonthlyRate;
  const rateLabel = grn.rentType === 'Monthly' ? 'Monthly Rate' : 'Seasonal Rate';
  const ratePerBag = grn.smallBagPrice ?? grn.bagPrice ?? 0;

  return (
    <div className={styles.container} id="merged-dual-section-delivery-panel">
      {/* SECTION A: Unclassified Genesis Bags */}
      <section className={styles.sectionCard} id="delivery-section-a-card" aria-labelledby="section-a-heading">
        <div className={styles.sectionHeader}>
          <h4 id="section-a-heading" className={styles.sectionTitle}>Section A — Bags with Unconfirmed Bag Types</h4>
          <Badge variant={pools.availableUnclassified > 0 ? 'warning' : 'neutral'}>
            Available: {pools.availableUnclassified} Genesis Bags
          </Badge>
        </div>

        <div className={styles.inputsRow}>
          <div className={styles.fieldGroup}>
            <label htmlFor="delivery-section-a-bag-type" className={styles.fieldLabel}>Bag Type <span aria-hidden="true">*</span></label>
            <Select
              id="delivery-section-a-bag-type" label="Bag Type" value={unclassifiedBagType}
              onChange={(e) => setUnclassifiedBagType(e.target.value as OperationalBagType | '')} aria-required="true"
            >
              <option value="">-- Select Bag Type --</option>
              <option value="S/B">Small &amp; Big (S/B)</option>
              <option value="Hybrid">Hybrid</option>
            </Select>
            {sectionAErrors.bagType && <span className={styles.errorText} role="alert">{sectionAErrors.bagType}</span>}
          </div>

          <div className={styles.fieldGroup}>
            <label htmlFor="delivery-section-a-quantity" className={styles.fieldLabel}>Quantity to Deliver (Max {pools.availableUnclassified})</label>
            <input
              id="delivery-section-a-quantity" type="number" min={0} max={pools.availableUnclassified}
              value={unclassifiedQty} onChange={(e) => setUnclassifiedQty(e.target.value === '' ? '' : Math.max(0, parseInt(e.target.value, 10) || 0))}
              placeholder="0" className={styles.inputNumber}
            />
            {sectionAErrors.quantity && <span className={styles.errorText} role="alert">{sectionAErrors.quantity}</span>}
          </div>

          {isSbSecA && (
            <>
              <div className={styles.fieldGroup}>
                <label htmlFor="delivery-section-a-small" className={styles.fieldLabel}>Small Bags</label>
                <input
                  id="delivery-section-a-small" type="number" min={0} max={typeof unclassifiedQty === 'number' ? unclassifiedQty : pools.availableUnclassified}
                  value={unclassifiedSmall} onChange={(e) => setUnclassifiedSmall(e.target.value === '' ? '' : Math.max(0, parseInt(e.target.value, 10) || 0))}
                  placeholder="0" className={styles.inputNumber}
                />
              </div>

              <div className={styles.fieldGroup}>
                <label htmlFor="delivery-section-a-big" className={styles.fieldLabel}>Big Bags</label>
                <input
                  id="delivery-section-a-big" type="number" min={0} max={typeof unclassifiedQty === 'number' ? unclassifiedQty : pools.availableUnclassified}
                  value={unclassifiedBig} onChange={(e) => setUnclassifiedBig(e.target.value === '' ? '' : Math.max(0, parseInt(e.target.value, 10) || 0))}
                  placeholder="0" className={styles.inputNumber}
                />
              </div>
            </>
          )}

          <DualSectionRateFields
            idPrefix="delivery-section-a"
            isHybrid={isHybridSecA}
            showSeasonal={Boolean(showSecASeasonal)}
            showMonthly={Boolean(showSecAMonthly)}
            seasonalPrice={unclassifiedSeasonalPrice}
            onSeasonalChange={setUnclassifiedSeasonalPrice}
            monthlyPrice={unclassifiedMonthlyPrice}
            onMonthlyChange={setUnclassifiedMonthlyPrice}
            rateLabel={rateLabel}
            ratePerBag={ratePerBag}
          />
        </div>

        {sectionAErrors.sum && <div className={styles.errorText} role="alert">{sectionAErrors.sum}</div>}

        <div className={styles.subtotalRow}>
          <span>Remaining Unclassified Stock: {remainingUnclassifiedStock} / {pools.availableUnclassified} bags</span>
          <span>Section A Rent: <strong className={styles.subtotalAmount}>₹{unclassifiedRent.toLocaleString('en-IN')}</strong></span>
        </div>
      </section>

      {/* SECTION B: Confirmed Repacked Bags */}
      <section className={styles.sectionCard} id="delivery-section-b-card" aria-labelledby="section-b-heading">
        <div className={styles.sectionHeader}>
          <h4 id="section-b-heading" className={styles.sectionTitle}>Section B — Confirmed Bags from Merged GRNs</h4>
          <Badge variant="primary">
            {isHybridSecB
              ? `Confirmed Hybrid: ${pools.availableConfirmedHybrid} bags`
              : `Confirmed Stock: ${pools.availableConfirmedSmall} Small, ${pools.availableConfirmedBig} Big`}
          </Badge>
        </div>

        <div className={styles.inputsRow}>
          {isHybridSecB ? (
            <div className={styles.fieldGroup}>
              <label htmlFor="delivery-section-b-hybrid" className={styles.fieldLabel}>Hybrid Bags (Max {pools.availableConfirmedHybrid})</label>
              <input
                id="delivery-section-b-hybrid" type="number" min={0} max={pools.availableConfirmedHybrid}
                value={confirmedQty} onChange={(e) => setConfirmedQty(e.target.value === '' ? '' : Math.max(0, parseInt(e.target.value, 10) || 0))}
                placeholder="0" className={styles.inputNumber}
              />
              {sectionBErrors.quantity && <span className={styles.errorText} role="alert">{sectionBErrors.quantity}</span>}
            </div>
          ) : (
            <>
              <div className={styles.fieldGroup}>
                <label htmlFor="delivery-section-b-small" className={styles.fieldLabel}>Small Bags (Max {pools.availableConfirmedSmall})</label>
                <input
                  id="delivery-section-b-small" type="number" min={0} max={pools.availableConfirmedSmall}
                  value={confirmedSmall} onChange={(e) => setConfirmedSmall(e.target.value === '' ? '' : Math.max(0, parseInt(e.target.value, 10) || 0))}
                  placeholder="0" className={styles.inputNumber}
                />
                {sectionBErrors.smallBags && <span className={styles.errorText} role="alert">{sectionBErrors.smallBags}</span>}
              </div>

              <div className={styles.fieldGroup}>
                <label htmlFor="delivery-section-b-big" className={styles.fieldLabel}>Big Bags (Max {pools.availableConfirmedBig})</label>
                <input
                  id="delivery-section-b-big" type="number" min={0} max={pools.availableConfirmedBig}
                  value={confirmedBig} onChange={(e) => setConfirmedBig(e.target.value === '' ? '' : Math.max(0, parseInt(e.target.value, 10) || 0))}
                  placeholder="0" className={styles.inputNumber}
                />
                {sectionBErrors.bigBags && <span className={styles.errorText} role="alert">{sectionBErrors.bigBags}</span>}
              </div>
            </>
          )}

          <DualSectionRateFields
            idPrefix="delivery-section-b"
            isHybrid={isHybridSecB}
            showSeasonal={Boolean(showSecBSeasonal)}
            showMonthly={Boolean(showSecBMonthly)}
            seasonalPrice={confirmedSeasonalPrice}
            onSeasonalChange={setConfirmedSeasonalPrice}
            monthlyPrice={confirmedMonthlyPrice}
            onMonthlyChange={setConfirmedMonthlyPrice}
            rateLabel={rateLabel}
            ratePerBag={ratePerBag}
          />
        </div>

        <div className={styles.subtotalRow}>
          <span>
            {isHybridSecB
              ? `Remaining Confirmed: ${remainingConfirmedHybrid} / ${pools.availableConfirmedHybrid} bags`
              : `Remaining Confirmed: ${remainingConfirmedSmall} Small, ${remainingConfirmedBig} Big`}
          </span>
          <span>Section B Rent: <strong className={styles.subtotalAmount}>₹{confirmedRent.toLocaleString('en-IN')}</strong></span>
        </div>
      </section>

      {/* SUMMARY BAR: Reconciling Section A + Section B */}
      <div className={styles.summaryBar} id="delivery-dual-section-summary-bar">
        <div className={styles.summaryItem}>
          <span className={styles.summaryLabel}>Total Delivery Bags</span>
          <span className={styles.summaryValue} id="dual-section-total-bags">
            {totalWithdrawingBags.toLocaleString('en-IN')} bags
          </span>
        </div>
        <div className={styles.summaryItem}>
          <span className={styles.summaryLabel}>Remaining Overall Stock</span>
          <span className={styles.summaryValue} id="dual-section-remaining-stock">
            {overallRemainingStock.toLocaleString('en-IN')} / {pools.totalAvailable.toLocaleString('en-IN')} bags
          </span>
        </div>
        <div className={styles.summaryItem}>
          <span className={styles.summaryLabel}>Total Outward Rent</span>
          <span className={styles.summaryValue} id="dual-section-total-rent" style={{ color: 'var(--color-primary-text)' }}>
            ₹{totalOutwardRent.toLocaleString('en-IN')}
          </span>
        </div>
      </div>
    </div>
  );
}
