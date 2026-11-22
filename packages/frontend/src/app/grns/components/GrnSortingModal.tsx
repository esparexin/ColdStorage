'use client';

import React, { useState } from 'react';
import {
  SORTING_REPACK_STEP_LABELS,
  type Commodity,
  type Grn,
  type RepackGrnInput,
  type RepackGrnResult,
  type SortGrnInput,
  type SortGrnResult,
} from '@cold-storage/contracts';
import { Button, Modal } from '@/components/ui';
import { Banner } from '@/components/ui/Banner';
import { requestWithAuth } from '@/lib/api-client';
import { formatDisplayDate } from '@/lib/date-format';
import { GrnSortingStep1Confirm } from './GrnSortingStep1Confirm';
import { GrnSortingStep2Repack } from './GrnSortingStep2Repack';
import { GrnSortingStep2Success } from './GrnSortingStep2Success';
import styles from './GrnSortingModal.module.css';

export interface GrnSortingModalProps {
  facilityId: string;
  grn: Grn;
  commodities?: Commodity[];
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (updatedGrn: Grn) => void;
}

export function GrnSortingModal({
  facilityId,
  grn,
  commodities = [],
  isOpen,
  onClose,
  onSuccess,
}: GrnSortingModalProps) {
  const [currentGrn, setCurrentGrn] = useState<Grn>(grn);
  const [activeStep, setActiveStep] = useState<1 | 2>(grn.isSorted ? 2 : 1);
  const [sortingResult, setSortingResult] = useState<SortGrnResult | null>(
    grn.isSorted
      ? {
          grn,
          billedAmount: 0,
          isSortingComplete: true,
        }
      : null,
  );
  const [repackResult, setRepackResult] = useState<RepackGrnResult | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);

  if (!isOpen) return null;

  const commodity = commodities.find((c) => c.id === currentGrn.commodityId) ?? null;
  const availableBags = currentGrn.closingBags ?? currentGrn.bags;

  const handleConfirmAndBill = async (input: SortGrnInput) => {
    setSubmitting(true);
    setApiError(null);
    try {
      const res = await requestWithAuth(
        `/api/facilities/${encodeURIComponent(facilityId)}/internal-movements/sort`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(input),
        },
      );
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to complete sorting confirmation');
      }
      setCurrentGrn(data.grn);
      setSortingResult(data);
    } catch (err: unknown) {
      setApiError(err instanceof Error ? err.message : 'An unexpected error occurred during sorting');
    } finally {
      setSubmitting(false);
    }
  };

  const handleExecuteRepack = async (input: RepackGrnInput) => {
    setSubmitting(true);
    setApiError(null);
    try {
      const res = await requestWithAuth(
        `/api/facilities/${encodeURIComponent(facilityId)}/internal-movements/repack`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(input),
        },
      );
      const data: RepackGrnResult & { success: boolean; error?: string } = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to complete repacking operation');
      }
      setRepackResult(data);
      setCurrentGrn(data.grn);
      onSuccess(data.grn);
    } catch (err: unknown) {
      setApiError(err instanceof Error ? err.message : 'An unexpected error occurred during repacking');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Sorting & Repacking Workflow: GRN ${currentGrn.grnNumber}`}
      subtitle={`Customer: ${currentGrn.customerName} • Commodity: ${currentGrn.commodityName}`}
      size="lg"
      footer={
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-2)' }}>
          <Button variant="outline" size="sm" onClick={onClose} disabled={submitting}>
            Cancel / Close
          </Button>
        </div>
      }
    >
      <div className={styles.modalContainer}>
        {apiError && <Banner message={apiError} id="grn-sorting-api-error" />}

        {/* Multi-step Header Stepper */}
        <div className={styles.stepperHeader}>
          <div
            className={`${styles.stepItem} ${activeStep === 1 ? styles.stepItemActive : ''} ${
              sortingResult?.isSortingComplete ? styles.stepItemCompleted : ''
            }`}
          >
            <span
              className={`${styles.stepNumber} ${activeStep === 1 ? styles.stepNumberActive : ''} ${
                sortingResult?.isSortingComplete ? styles.stepNumberCompleted : ''
              }`}
            >
              1
            </span>
            <span>{SORTING_REPACK_STEP_LABELS.step1}</span>
          </div>

          <span style={{ color: 'var(--color-text-muted)' }}>→</span>

          <div
            className={`${styles.stepItem} ${activeStep === 2 ? styles.stepItemActive : ''}`}
          >
            <span
              className={`${styles.stepNumber} ${activeStep === 2 ? styles.stepNumberActive : ''}`}
            >
              2
            </span>
            <span>{SORTING_REPACK_STEP_LABELS.step2}</span>
          </div>
        </div>

        {/* Persistent Lot Identity Strip */}
        <div className={styles.lotSummaryCard}>
          <div className={styles.summaryHeader}>Current Lot State (Read-Only)</div>
          <div className={styles.summaryGrid}>
            <div className={styles.summaryItem}>
              <span className={styles.summaryLabel}>GRN Number</span>
              <span className={styles.summaryValue}>{currentGrn.grnNumber}</span>
            </div>
            <div className={styles.summaryItem}>
              <span className={styles.summaryLabel}>Inward Date</span>
              <span className={styles.summaryValue}>{formatDisplayDate(currentGrn.date)}</span>
            </div>
            <div className={styles.summaryItem}>
              <span className={styles.summaryLabel}>Customer</span>
              <span className={styles.summaryValue}>{currentGrn.customerName}</span>
            </div>
            <div className={styles.summaryItem}>
              <span className={styles.summaryLabel}>Available Bags</span>
              <span className={styles.summaryValue}>{availableBags} bags</span>
            </div>
            <div className={styles.summaryItem}>
              <span className={styles.summaryLabel}>Existing Bag Type</span>
              <span className={styles.summaryValue}>{currentGrn.bagType}</span>
            </div>
            <div className={styles.summaryItem}>
              <span className={styles.summaryLabel}>Total Weight</span>
              <span className={styles.summaryValue}>
                {currentGrn.totalBagsWeight != null ? `${currentGrn.totalBagsWeight} kg` : '—'}
              </span>
            </div>
            <div className={styles.summaryItem}>
              <span className={styles.summaryLabel}>Chamber</span>
              <span className={styles.summaryValue}>{currentGrn.chamber}</span>
            </div>
          </div>
        </div>

        {/* Step Views */}
        {repackResult ? (
          <GrnSortingStep2Success
            facilityId={facilityId}
            repackResult={repackResult}
            onDone={onClose}
          />
        ) : activeStep === 1 ? (
          <GrnSortingStep1Confirm
            grn={currentGrn}
            commodity={commodity}
            submitting={submitting}
            onConfirmAndBill={handleConfirmAndBill}
            sortingResult={sortingResult}
            onProceedToRepack={() => setActiveStep(2)}
          />
        ) : (
          <GrnSortingStep2Repack
            grn={currentGrn}
            commodity={commodity}
            submitting={submitting}
            onExecuteRepack={handleExecuteRepack}
            onBack={() => setActiveStep(1)}
          />
        )}
      </div>
    </Modal>
  );
}
