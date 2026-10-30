'use client';

import React from 'react';
import { Layers } from 'lucide-react';
import { deriveHybridRateVisibility, type OperationalBagType, type RentType } from '@cold-storage/contracts';
import { Input, Select } from '@/components/ui';
import styles from './InternalMovementModal.module.css';

export interface MergeStep4RepackSectionProps {
  repackMode: boolean; onRepackModeChange: (active: boolean) => void;
  repackBagType: OperationalBagType; onRepackBagTypeChange: (type: OperationalBagType) => void;
  repackSmall: number | ''; onRepackSmallChange: (val: number | '') => void;
  repackBig: number | ''; onRepackBigChange: (val: number | '') => void;
  repackQuantity: number | ''; onRepackQuantityChange: (val: number | '') => void;
  repackSeasonalBagPrice: number | ''; onRepackSeasonalBagPriceChange: (val: number | '') => void;
  repackMonthlyBagPrice: number | ''; onRepackMonthlyBagPriceChange: (val: number | '') => void;
  repackBagPrice: number | ''; onRepackBagPriceChange: (val: number | '') => void;
  totalSourceBags: number; referenceWeight: number | ''; onReferenceWeightChange: (val: number | '') => void;
  repackHamaliCharge: number; actualRepackedBags: number; commodityHamaliRate: number;
  movementDate: string; targetSmallRate: number; targetBigRate: number; submitting: boolean;
  targetGrnRentType: RentType; targetGrnDate: Date | string;
}

export function MergeStep4RepackSection(props: MergeStep4RepackSectionProps) {
  const {
    repackMode, onRepackModeChange, repackBagType, onRepackBagTypeChange,
    repackSmall, onRepackSmallChange, repackBig, onRepackBigChange,
    repackQuantity, onRepackQuantityChange, repackSeasonalBagPrice, onRepackSeasonalBagPriceChange,
    repackMonthlyBagPrice, onRepackMonthlyBagPriceChange, repackBagPrice, onRepackBagPriceChange,
    totalSourceBags, referenceWeight, onReferenceWeightChange, repackHamaliCharge,
    actualRepackedBags, commodityHamaliRate, movementDate, targetSmallRate,
    targetBigRate, submitting, targetGrnRentType, targetGrnDate,
  } = props;

  const visibility = deriveHybridRateVisibility({
    rentType: targetGrnRentType,
    inwardDate: targetGrnDate,
    deliveryDate: movementDate,
  });

  return (
    <div className={styles.compactCard}>
      <div className={styles.cardHeader}>
        <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Layers size={14} aria-hidden="true" />
          <span>Physical Repacking — Re-Bagging</span>
        </span>
      </div>

      <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: 'var(--text-xs)', cursor: 'pointer', padding: '4px 0' }}>
        <input
          type="checkbox"
          id="repack-mode-step4"
          checked={repackMode}
          onChange={(e) => onRepackModeChange(e.target.checked)}
          disabled={submitting}
        />
        <span style={{ fontWeight: 'var(--font-semibold)' }}>
          Physically Repack / Re-bag Stock (Enter actual resulting counts)
        </span>
      </label>

      {repackMode && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1-5)', marginTop: '4px' }}>
          <div>
            <Select
              id="repack-bag-type-select"
              label="Bag Type"
              value={repackBagType === 'Hybrid' ? 'Hybrid' : 'S/B'}
              onChange={(e) => onRepackBagTypeChange(e.target.value as OperationalBagType)}
              disabled={submitting}
            >
              <option value="S/B">S/B (Small &amp; Big)</option>
              <option value="Hybrid">Hybrid</option>
            </Select>
          </div>

          {repackBagType === 'S/B' ? (
            <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
              <div style={{ flex: 1 }}>
                <label htmlFor="repack-small-step4" className={styles.inputLabel}>
                  Repacked Small Bags *
                </label>
                <Input
                  id="repack-small-step4"
                  type="number"
                  min={0}
                  placeholder="Small Bags"
                  value={repackSmall}
                  rightAction={<span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)' }}>₹{targetSmallRate}/bag</span>}
                  onChange={(e) => onRepackSmallChange(e.target.value !== '' ? parseInt(e.target.value, 10) : '')}
                  disabled={submitting}
                  required
                />
              </div>
              <div style={{ flex: 1 }}>
                <label htmlFor="repack-big-step4" className={styles.inputLabel}>
                  Repacked Big Bags *
                </label>
                <Input
                  id="repack-big-step4"
                  type="number"
                  min={0}
                  placeholder="Big Bags"
                  value={repackBig}
                  rightAction={<span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)' }}>₹{targetBigRate}/bag</span>}
                  onChange={(e) => onRepackBigChange(e.target.value !== '' ? parseInt(e.target.value, 10) : '')}
                  disabled={submitting}
                  required
                />
              </div>
            </div>
          ) : (
            <>
              <div>
                <label htmlFor="repack-hybrid-quantity-step4" className={styles.inputLabel}>
                  Repacked Hybrid Bags *
                </label>
                <Input
                  id="repack-hybrid-quantity-step4"
                  type="number"
                  min={1}
                  placeholder={`e.g. ${totalSourceBags}`}
                  value={repackQuantity}
                  rightAction={<span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)' }}>Total: {totalSourceBags}</span>}
                  onChange={(e) => onRepackQuantityChange(e.target.value !== '' ? parseInt(e.target.value, 10) : '')}
                  disabled={submitting}
                  required
                />
              </div>

              {(visibility.showSeasonalRate || visibility.showMonthlyRate) && (
                <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                  {visibility.showSeasonalRate && (
                    <div style={{ flex: 1 }}>
                      <label htmlFor="repack-seasonal-rate-step4" className={styles.inputLabel}>
                        Seasonal Rate
                      </label>
                      <Input
                        id="repack-seasonal-rate-step4"
                        type="number"
                        min={0}
                        placeholder="0.00"
                        value={repackSeasonalBagPrice}
                        rightAction={<span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)' }}>₹/bag</span>}
                        onChange={(e) => onRepackSeasonalBagPriceChange(e.target.value !== '' ? parseFloat(e.target.value) : '')}
                        disabled={submitting}
                      />
                    </div>
                  )}
                  {visibility.showMonthlyRate && (
                    <div style={{ flex: 1 }}>
                      <label htmlFor="repack-monthly-rate-step4" className={styles.inputLabel}>
                        Monthly Rate
                      </label>
                      <Input
                        id="repack-monthly-rate-step4"
                        type="number"
                        min={0}
                        placeholder="0.00"
                        value={repackMonthlyBagPrice}
                        rightAction={<span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)' }}>₹/bag</span>}
                        onChange={(e) => onRepackMonthlyBagPriceChange(e.target.value !== '' ? parseFloat(e.target.value) : '')}
                        disabled={submitting}
                      />
                    </div>
                  )}
                </div>
              )}

              {!visibility.showSeasonalRate && !visibility.showMonthlyRate && (
                <div>
                  <label htmlFor="repack-bag-price-step4" className={styles.inputLabel}>
                    Each Bag Price
                  </label>
                  <Input
                    id="repack-bag-price-step4"
                    type="number"
                    min={0}
                    placeholder="0.00"
                    value={repackBagPrice}
                    rightAction={<span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)' }}>₹/bag</span>}
                    onChange={(e) => onRepackBagPriceChange(e.target.value !== '' ? parseFloat(e.target.value) : '')}
                    disabled={submitting}
                  />
                </div>
              )}
            </>
          )}

          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--text-xs)', background: 'var(--color-surface-1)', padding: 'var(--space-1) var(--space-2)', borderRadius: 'var(--radius-sm)' }}>
            <span>Source Consolidated Pool:</span>
            <strong>{totalSourceBags} Bags</strong>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--text-xs)', background: 'var(--color-surface-1)', padding: 'var(--space-1) var(--space-2)', borderRadius: 'var(--radius-sm)' }}>
            <span>Physical Repacked Total:</span>
            <strong style={{ color: 'var(--color-primary-text)' }}>{actualRepackedBags} Bags</strong>
          </div>
          {actualRepackedBags > 0 && actualRepackedBags !== totalSourceBags && (
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--text-xs)', background: 'var(--color-surface-1)', padding: 'var(--space-1) var(--space-2)', borderRadius: 'var(--radius-sm)' }}>
              <span>Repacking Net Variance:</span>
              <strong style={{ color: actualRepackedBags < totalSourceBags ? 'var(--color-warning-text)' : 'var(--color-primary-text)' }}>
                {actualRepackedBags > totalSourceBags ? `+${actualRepackedBags - totalSourceBags}` : actualRepackedBags - totalSourceBags} Bags {actualRepackedBags < totalSourceBags ? '(Shrinkage / Loss)' : '(Smaller Packaging)'}
              </strong>
            </div>
          )}

          {repackHamaliCharge > 0 && (
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', background: 'var(--color-surface-1)', padding: 'var(--space-1) var(--space-2)', borderRadius: 'var(--radius-sm)' }}>
              Repacking Hamali Labor: <strong>₹{repackHamaliCharge}</strong> ({actualRepackedBags} bags @ ₹{commodityHamaliRate}/bag)
            </div>
          )}
        </div>
      )}

      <div style={{ display: 'flex', gap: 'var(--space-2)', marginTop: 'var(--space-1)' }}>
        <div style={{ flex: 1 }}>
          <label htmlFor="merge-ref-weight" className={styles.inputLabel}>
            Reference Weight (kg) — Optional
          </label>
          <Input
            id="merge-ref-weight"
            type="number"
            min={0}
            placeholder="e.g. 2500"
            value={referenceWeight}
            onChange={(e) => onReferenceWeightChange(e.target.value !== '' ? parseFloat(e.target.value) : '')}
            disabled={submitting}
          />
        </div>
        <div style={{ flex: 1 }}>
          <label htmlFor="merge-date" className={styles.inputLabel}>
            Movement Date *
          </label>
          <Input
            id="merge-date"
            type="date"
            value={movementDate}
            readOnly
            disabled={submitting}
            aria-label="Movement Date (read-only)"
            title="Authoritative operational date"
            required
          />
        </div>
      </div>
    </div>
  );
}
