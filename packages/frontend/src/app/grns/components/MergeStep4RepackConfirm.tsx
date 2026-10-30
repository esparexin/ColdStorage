'use client';

import React from 'react';
import {
  isHybridBagCategory,
  resolveOutwardRates,
  type Grn,
  type OperationalBagType,
  type OutwardBagCategory,
  type TransferPaymentDecision,
} from '@cold-storage/contracts';
import { Badge, Input } from '@/components/ui';
import { WizardStepActions } from './WizardStepActions';
import { MergeStep4RepackSection } from './MergeStep4RepackSection';
import styles from './InternalMovementModal.module.css';

interface MergeStep4RepackConfirmProps {
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
  movementDate: string; targetGrn: Grn; targetCurrentRemaining: number;
  addedBagsToTarget: number; isRepackFilled: boolean; targetNewRemaining: number;
  confirmationCategory: OutwardBagCategory; resultingBagType: string;
  settlementDecision: TransferPaymentDecision; settleAmount: number; totalSourcePendingRent: number;
  reason: string; onReasonChange: (r: string) => void; remarks: string; onRemarksChange: (r: string) => void;
  selectedSourcesCount: number; movedSmall: number; movedBig: number; submitting: boolean; onBack: () => void;
}

export function MergeStep4RepackConfirm(props: MergeStep4RepackConfirmProps) {
  const {
    repackMode, onRepackModeChange, repackBagType, onRepackBagTypeChange,
    repackSmall, onRepackSmallChange, repackBig, onRepackBigChange,
    repackQuantity, onRepackQuantityChange, repackSeasonalBagPrice, onRepackSeasonalBagPriceChange,
    repackMonthlyBagPrice, onRepackMonthlyBagPriceChange, repackBagPrice, onRepackBagPriceChange,
    totalSourceBags, referenceWeight, onReferenceWeightChange, repackHamaliCharge,
    actualRepackedBags, commodityHamaliRate, movementDate, targetGrn, targetCurrentRemaining,
    addedBagsToTarget, isRepackFilled, targetNewRemaining, confirmationCategory,
    resultingBagType, totalSourcePendingRent,
    reason, onReasonChange, remarks, onRemarksChange, selectedSourcesCount,
    movedSmall, movedBig, submitting, onBack,
  } = props;

  const targetRates = resolveOutwardRates(targetGrn.rentType, {
    smallBagPrice: targetGrn.smallBagPrice,
    bigBagPrice: targetGrn.bigBagPrice,
    bagPrice: targetGrn.bagPrice,
  });
  const targetSmallRate = targetRates.small > 0 ? targetRates.small : (targetGrn.smallBagPrice ?? targetGrn.bagPrice ?? 10);
  const targetBigRate = targetRates.big > 0 ? targetRates.big : (targetGrn.bigBagPrice ?? targetGrn.bagPrice ?? 15);
  const isHybrid = repackMode
    ? repackBagType === 'Hybrid'
    : (isHybridBagCategory(confirmationCategory) || isHybridBagCategory(targetGrn.bagType));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
      <div className={styles.reviewGrid}>
        <MergeStep4RepackSection
          repackMode={repackMode}
          onRepackModeChange={onRepackModeChange}
          repackBagType={repackBagType}
          onRepackBagTypeChange={onRepackBagTypeChange}
          repackSmall={repackSmall}
          onRepackSmallChange={onRepackSmallChange}
          repackBig={repackBig}
          onRepackBigChange={onRepackBigChange}
          repackQuantity={repackQuantity}
          onRepackQuantityChange={onRepackQuantityChange}
          repackSeasonalBagPrice={repackSeasonalBagPrice}
          onRepackSeasonalBagPriceChange={onRepackSeasonalBagPriceChange}
          repackMonthlyBagPrice={repackMonthlyBagPrice}
          onRepackMonthlyBagPriceChange={onRepackMonthlyBagPriceChange}
          repackBagPrice={repackBagPrice}
          onRepackBagPriceChange={onRepackBagPriceChange}
          totalSourceBags={totalSourceBags}
          referenceWeight={referenceWeight}
          onReferenceWeightChange={onReferenceWeightChange}
          repackHamaliCharge={repackHamaliCharge}
          actualRepackedBags={actualRepackedBags}
          commodityHamaliRate={commodityHamaliRate}
          movementDate={movementDate}
          targetSmallRate={targetSmallRate}
          targetBigRate={targetBigRate}
          submitting={submitting}
          targetGrnRentType={targetGrn.rentType}
          targetGrnDate={targetGrn.date}
        />

        {/* Destination Preview & Audit */}
        <div className={styles.compactCard}>
          <div className={styles.cardHeader}>
            <span>Destination GRN Preview & Audit</span>
            <Badge variant="primary">Audit-Safe</Badge>
          </div>

          <div className={styles.detailRow}>
            <span className={styles.detailLabel}>Target GRN:</span>
            <span className={styles.detailValue}>{targetGrn.grnNumber} ({targetGrn.customerName})</span>
          </div>
          <div className={styles.detailRow}>
            <span className={styles.detailLabel}>Initial Target Stock:</span>
            <span className={styles.detailValue}>{targetCurrentRemaining} bags</span>
          </div>
          <div className={styles.detailRow}>
            <span className={styles.detailLabel}>+ Added from Merge:</span>
            <span className={styles.detailValue} style={{ color: 'var(--color-primary-text)', fontWeight: 'var(--font-bold)' }}>
              {repackMode && !isRepackFilled ? (
                <span style={{ color: 'var(--color-text-secondary)', fontWeight: 'normal' }}>Pending repacked counts</span>
              ) : repackMode && isRepackFilled ? (
                repackBagType === 'Hybrid' ? (
                  `+${addedBagsToTarget} Bags (Hybrid)`
                ) : (
                  `+${addedBagsToTarget} Bags (${repackSmall}S @ ₹${targetSmallRate} · ${repackBig}B @ ₹${targetBigRate})`
                )
              ) : isHybrid ? (
                `+${addedBagsToTarget} Bags (Hybrid)`
              ) : movedSmall > 0 && movedBig > 0 ? (
                `+${addedBagsToTarget} Bags (${movedSmall}S @ ₹${targetSmallRate} · ${movedBig}B @ ₹${targetBigRate})`
              ) : movedSmall > 0 ? (
                `+${addedBagsToTarget} Bags (${movedSmall} Small @ ₹${targetSmallRate})`
              ) : movedBig > 0 ? (
                `+${addedBagsToTarget} Bags (${movedBig} Big @ ₹${targetBigRate})`
              ) : (
                `+${addedBagsToTarget} Bags`
              )}
            </span>
          </div>
          <div className={styles.detailRow} style={{ borderTop: '1px dashed var(--color-border)', paddingTop: 'var(--space-1)' }}>
            <span className={styles.detailLabel}>Combined Target Stock:</span>
            <span className={styles.detailValue} style={{ color: 'var(--color-primary-text)', fontWeight: 'var(--font-bold)', fontSize: 'var(--text-sm)' }}>{targetNewRemaining} Bags</span>
          </div>
          <div className={styles.detailRow}>
            <span className={styles.detailLabel}>Resulting Bag Type:</span>
            <span className={styles.detailValue}>
              <Badge variant="primary">
                {isHybrid ? 'Hybrid' : resultingBagType === 'S/B' || resultingBagType === 'S+B' ? `Small & Big (₹${targetSmallRate} / ₹${targetBigRate})` : resultingBagType === 'S' ? `Small Bags (₹${targetSmallRate}/bag)` : resultingBagType === 'B' ? `Big Bags (₹${targetBigRate}/bag)` : resultingBagType}
              </Badge>
            </span>
          </div>
          <div className={styles.detailRow}>
            <span className={styles.detailLabel}>Rent Settlement:</span>
            <span className={styles.detailValue}>
              {totalSourcePendingRent > 0
                ? `Carried ₹${totalSourcePendingRent.toLocaleString('en-IN')} forward (Pay Later)`
                : 'Fully Settled (₹0 due)'}
            </span>
          </div>

          <div className={styles.formSection} style={{ marginTop: 'var(--space-1)' }}>
            <label htmlFor="merge-reason" className={styles.inputLabel}>Audit Reason (min 5 chars) *</label>
            <Input id="merge-reason" placeholder="e.g. Stock consolidation / Re-bagging lot" value={reason} onChange={(e) => onReasonChange(e.target.value)} disabled={submitting} required />
          </div>

          <div className={styles.formSection}>
            <label htmlFor="merge-remarks" className={styles.inputLabel}>Additional Remarks (Optional)</label>
            <textarea id="merge-remarks" aria-label="Additional Remarks" rows={2} className={styles.textarea} placeholder="Notes or remarks..." value={remarks} onChange={(e) => onRemarksChange(e.target.value)} disabled={submitting} />
          </div>

          <div className={styles.noticeBox}>
            All {selectedSourcesCount} source GRN{selectedSourcesCount > 1 ? 's' : ''} will be permanently closed. Stock and obligations will reside on surviving GRN {targetGrn.grnNumber}.
          </div>
        </div>
      </div>

      <WizardStepActions onBack={onBack} backLabel="Back to Settlement" isSubmitStep submitLabel="Execute Merge & Repack" submitting={submitting} />
    </div>
  );
}
