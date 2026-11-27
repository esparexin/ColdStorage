'use client';

import React from 'react';
import { Layers } from 'lucide-react';
import type { OperationalBagType } from '@cold-storage/contracts';
import { Badge, Input, Select } from '@/components/ui';
import { WizardStepActions } from './WizardStepActions';
import styles from './InternalMovementModal.module.css';

/**
 * TransferStep3Repack — Repacking, Rebagging & Destination Chamber Selection.
 *
 * During ownership transfer, the new owner (buyer) may optionally request:
 * 1. Physical Rebagging / Repacking: converting between S/B split and Hybrid compositions.
 * 2. Relocation: moving the transferred stock to a designated destination chamber.
 * 3. Party Mark: assigning the buyer's custom identification mark.
 * 4. Reference Weight: recording updated physical consignment weight.
 *
 * If no repacking or relocation is requested, the current chamber and stock composition
 * are preserved by default without modification.
 */

interface TransferStep3RepackProps {
  currentChamber: string;
  destinationChamber: string;
  onDestinationChamberChange: (c: string) => void;
  storageMark: string;
  partyMark: string;
  onPartyMarkChange: (pm: string) => void;
  resultingBagType: OperationalBagType;
  onResultingBagTypeChange: (t: OperationalBagType) => void;
  totalBags: number;
  repackedSmallBags: number | '';
  onRepackedSmallChange: (val: number | '') => void;
  repackedBigBags: number | '';
  onRepackedBigChange: (val: number | '') => void;
  repackedQuantity: number | '';
  onRepackedQuantityChange: (val: number | '') => void;
  referenceWeight: number | '';
  onReferenceWeightChange: (val: number | '') => void;
  submitting: boolean;
  onBack: () => void;
  onNext: () => void;
}

export function TransferStep3Repack(props: TransferStep3RepackProps) {
  const {
    currentChamber, destinationChamber, onDestinationChamberChange,
    storageMark, partyMark, onPartyMarkChange,
    resultingBagType, onResultingBagTypeChange, totalBags,
    repackedSmallBags, onRepackedSmallChange, repackedBigBags, onRepackedBigChange,
    repackedQuantity, onRepackedQuantityChange, referenceWeight, onReferenceWeightChange,
    submitting, onBack, onNext,
  } = props;

  const isHybrid = resultingBagType === 'Hybrid';
  const totalRepacked = isHybrid
    ? (typeof repackedQuantity === 'number' ? repackedQuantity : 0)
    : ((typeof repackedSmallBags === 'number' ? repackedSmallBags : 0) + (typeof repackedBigBags === 'number' ? repackedBigBags : 0));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
      <div className={styles.compactCard}>
        <div className={styles.cardHeader}>
          <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Layers size={14} aria-hidden="true" />
            <span>Repacking / Rebagging &amp; Destination Chamber</span>
          </span>
          <Badge variant="primary">Mandatory Chamber</Badge>
        </div>

        <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', margin: '0 0 var(--space-1)' }}>
          Specify the resulting bag composition, destination chamber, and optional total weight for this transfer.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
          <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
            <div style={{ flex: 1 }}>
              <Select
                id="transfer-resulting-bag-type"
                label="Resulting Bag Type *"
                value={resultingBagType}
                onChange={(e) => onResultingBagTypeChange(e.target.value as OperationalBagType)}
                disabled={submitting}
              >
                <option value="S/B">S/B (Small / Big)</option>
                <option value="Hybrid">Hybrid</option>
              </Select>
            </div>
            <div style={{ flex: 1 }}>
              <label htmlFor="transfer-destination-chamber" className={styles.inputLabel}>Destination Chamber *</label>
              <Input
                id="transfer-destination-chamber"
                type="text"
                required
                maxLength={20}
                placeholder={currentChamber ? `Current: ${currentChamber}` : 'e.g. CH-01'}
                value={destinationChamber}
                onChange={(e) => onDestinationChamberChange(e.target.value)}
                disabled={submitting}
              />
            </div>
          </div>

          <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
            <div style={{ flex: 1 }}>
              <label htmlFor="transfer-storage-mark" className={styles.inputLabel}>Storage Mark</label>
              <Input
                id="transfer-storage-mark"
                type="text"
                readOnly
                tabIndex={-1}
                value={storageMark}
                aria-label="Storage Mark (GR Number)"
              />
            </div>
            <div style={{ flex: 1 }}>
              <label htmlFor="transfer-party-mark" className={styles.inputLabel}>Party Mark</label>
              <Input
                id="transfer-party-mark"
                type="text"
                maxLength={20}
                placeholder="e.g. KSN-99 (max 20)"
                value={partyMark}
                onChange={(e) => onPartyMarkChange(e.target.value)}
                disabled={submitting}
              />
            </div>
          </div>

          {isHybrid ? (
            <div>
              <label htmlFor="transfer-repacked-quantity" className={styles.inputLabel}>Repacked Hybrid Quantity *</label>
              <Input
                id="transfer-repacked-quantity"
                type="number"
                min={1}
                value={repackedQuantity}
                onChange={(e) => onRepackedQuantityChange(e.target.value !== '' ? parseInt(e.target.value, 10) : '')}
                placeholder={`Total bags: ${totalBags}`}
                disabled={submitting}
                required
              />
            </div>
          ) : (
            <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
              <div style={{ flex: 1 }}>
                <label htmlFor="transfer-repacked-small" className={styles.inputLabel}>Repacked Small Bags *</label>
                <Input
                  id="transfer-repacked-small"
                  type="number"
                  min={0}
                  value={repackedSmallBags}
                  onChange={(e) => onRepackedSmallChange(e.target.value !== '' ? parseInt(e.target.value, 10) : '')}
                  placeholder="Small Bags"
                  disabled={submitting}
                  required
                />
              </div>
              <div style={{ flex: 1 }}>
                <label htmlFor="transfer-repacked-big" className={styles.inputLabel}>Repacked Big Bags *</label>
                <Input
                  id="transfer-repacked-big"
                  type="number"
                  min={0}
                  value={repackedBigBags}
                  onChange={(e) => onRepackedBigChange(e.target.value !== '' ? parseInt(e.target.value, 10) : '')}
                  placeholder="Big Bags"
                  disabled={submitting}
                  required
                />
              </div>
            </div>
          )}

          <div>
            <label htmlFor="transfer-reference-weight" className={styles.inputLabel}>Total Weight (kg) — Optional</label>
            <Input
              id="transfer-reference-weight"
              type="number"
              min={0.1}
              step={0.1}
              value={referenceWeight}
              onChange={(e) => onReferenceWeightChange(e.target.value !== '' ? parseFloat(e.target.value) : '')}
              placeholder="e.g. 5000"
              disabled={submitting}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--text-xs)', background: 'var(--color-surface-1)', padding: 'var(--space-1) var(--space-2)', borderRadius: 'var(--radius-sm)' }}>
            <span>Stock Being Transferred:</span>
            <strong>{totalBags} Bags</strong>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--text-xs)', background: 'var(--color-surface-1)', padding: 'var(--space-1) var(--space-2)', borderRadius: 'var(--radius-sm)' }}>
            <span>Repacked Composition Total:</span>
            <strong style={{ color: totalRepacked > 0 ? 'var(--color-primary-text)' : 'var(--color-text-secondary)' }}>
              {totalRepacked > 0 ? `${totalRepacked} Bags ✓` : '—'}
            </strong>
          </div>
        </div>
      </div>

      <WizardStepActions
        onBack={onBack}
        backLabel="Back to Dues & Settlement"
        onNext={onNext}
        nextLabel="Next: Review & Confirm"
        submitting={submitting}
      />
    </div>
  );
}
