'use client';

import React from 'react';
import { Layers } from 'lucide-react';
import { type OperationalBagType, type RentType } from '@cold-storage/contracts';
import { Input, Select } from '@/components/ui';
import styles from './InternalMovementModal.module.css';

export interface MergeStep4RepackSectionProps {
  destinationChamber: string; onDestinationChamberChange: (val: string) => void;
  partyMark: string; onPartyMarkChange: (val: string) => void;
  storageMark: string; onStorageMarkChange: (val: string) => void;
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
  totalConsolidatedBags?: number;
}

export function MergeStep4RepackSection(props: MergeStep4RepackSectionProps) {
  const {
    destinationChamber, onDestinationChamberChange,
    partyMark, onPartyMarkChange, storageMark, onStorageMarkChange,
    repackMode, onRepackModeChange, repackBagType, onRepackBagTypeChange,
    repackSmall, onRepackSmallChange, repackBig, onRepackBigChange,
    repackQuantity, onRepackQuantityChange, repackSeasonalBagPrice, onRepackSeasonalBagPriceChange,
    repackMonthlyBagPrice, onRepackMonthlyBagPriceChange,
    referenceWeight, onReferenceWeightChange, repackHamaliCharge,
    actualRepackedBags, commodityHamaliRate, movementDate, targetSmallRate,
    targetBigRate, submitting, targetGrnRentType,
  } = props;

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
                <Input id="repack-small-step4" label={`Repacked Small Bags * (₹${targetSmallRate}/bag)`} type="number" min={0} placeholder="Small Bags" value={repackSmall} onChange={(e) => onRepackSmallChange(e.target.value !== '' ? parseInt(e.target.value, 10) : '')} disabled={submitting} required />
              </div>
              <div style={{ flex: 1 }}>
                <Input id="repack-big-step4" label={`Repacked Big Bags * (₹${targetBigRate}/bag)`} type="number" min={0} placeholder="Big Bags" value={repackBig} onChange={(e) => onRepackBigChange(e.target.value !== '' ? parseInt(e.target.value, 10) : '')} disabled={submitting} required />
              </div>
            </div>
          ) : (
            <>
              <div>
                <Input id="repack-hybrid-quantity-step4" label="Repacked Hybrid Bags *" type="number" min={1} placeholder="e.g. 35" value={repackQuantity} onChange={(e) => onRepackQuantityChange(e.target.value !== '' ? parseInt(e.target.value, 10) : '')} disabled={submitting} required />
              </div>

              <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                {targetGrnRentType !== 'Monthly' && (
                  <div style={{ flex: 1 }}>
                    <Input id="repack-seasonal-rate-step4" label="Seasonal Rate (₹/bag)" type="number" min={0} placeholder="0.00" value={repackSeasonalBagPrice} onChange={(e) => onRepackSeasonalBagPriceChange(e.target.value !== '' ? parseFloat(e.target.value) : '')} disabled={submitting} />
                  </div>
                )}
                <div style={{ flex: 1 }}>
                  <Input id="repack-monthly-rate-step4" label="Monthly Rate (₹/bag)" type="number" min={0} placeholder="0.00" value={repackMonthlyBagPrice} onChange={(e) => onRepackMonthlyBagPriceChange(e.target.value !== '' ? parseFloat(e.target.value) : '')} disabled={submitting} />
                </div>
              </div>
            </>
          )}

          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--text-xs)', background: 'var(--color-surface-1)', padding: 'var(--space-1) var(--space-2)', borderRadius: 'var(--radius-sm)' }}>
            <span>Physical Repacked Total:</span>
            <strong style={{ color: 'var(--color-primary-text)' }}>{actualRepackedBags} Bags</strong>
          </div>

          {repackHamaliCharge > 0 && (
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', background: 'var(--color-surface-1)', padding: 'var(--space-1) var(--space-2)', borderRadius: 'var(--radius-sm)' }}>
              Repacking Hamali Labor: <strong>₹{repackHamaliCharge}</strong> ({actualRepackedBags} bags @ ₹{commodityHamaliRate}/bag)
            </div>
          )}
        </div>
      )}

      <div style={{ display: 'flex', gap: 'var(--space-2)', marginTop: 'var(--space-1)' }}>
        <div style={{ flex: 1 }}>
          <Input id="merge-destination-chamber" label="Destination Chamber *" type="text" required maxLength={20} value={destinationChamber} placeholder="e.g. A or CH-01" onChange={(e) => onDestinationChamberChange(e.target.value)} disabled={submitting} />
        </div>
        <div style={{ flex: 1 }}>
          <Input id="merge-party-mark" label="Party Mark" type="text" maxLength={20} value={partyMark} placeholder="e.g. KSN-99 (max 20)" onChange={(e) => onPartyMarkChange(e.target.value)} disabled={submitting} />
        </div>
        <div style={{ flex: 1 }}>
          <Input id="merge-storage-mark" label="Storage Mark" type="text" maxLength={20} value={storageMark} placeholder="e.g. ST-01 (max 20)" onChange={(e) => onStorageMarkChange(e.target.value)} disabled={submitting} />
        </div>
      </div>

      <div style={{ display: 'flex', gap: 'var(--space-2)', marginTop: 'var(--space-1)' }}>
        <div style={{ flex: 1 }}>
          <Input id="merge-ref-weight" label="Reference Weight (kg) — Optional" type="number" min={0} placeholder="e.g. 2500" value={referenceWeight} onChange={(e) => onReferenceWeightChange(e.target.value !== '' ? parseFloat(e.target.value) : '')} disabled={submitting} />
        </div>
        <div style={{ flex: 1 }}>
          <Input id="merge-date" label="Merge Date *" type="date" value={movementDate} readOnly disabled={submitting} aria-label="Merge Date (read-only)" title="Authoritative operational date" required />
        </div>
      </div>
    </div>
  );
}
