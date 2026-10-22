'use client';

import React, { useEffect } from 'react';
import { ArrowLeft } from 'lucide-react';
import type { DeliveryChallan, DeliverySummary, Grn, RentSummaryDto } from '@cold-storage/contracts';
import { Button } from '@/components/ui';
import { Banner } from '@/components/ui/Banner';
import { useCreateDeliveryForm } from '../hooks/useCreateDeliveryForm';
import { EligibleGrnSection } from './EligibleGrnSection';
import { IssueDeliveryChallanModal } from './IssueDeliveryChallanModal';
import styles from './IssueDeliveryChallanPanel.module.css';

export interface IssueDeliveryChallanPanelProps {
  facilityId: string;
  onCancel: () => void;
  onSuccess: (newDelivery: DeliveryChallan, summary?: DeliverySummary) => void;
  onPayRent: (account: RentSummaryDto) => void;
  rentPaidTick: number;
  canPayRent: boolean;
  onClearLoan?: (grn: Grn) => void;
  loanClearedTick?: number;
  canClearLoan?: boolean;
  initialGrnId?: string;
  onBackToGrn?: () => void;
  onClearInitialGrn?: () => void;
}

export function IssueDeliveryChallanPanel({
  facilityId,
  onCancel,
  onSuccess,
  onPayRent,
  rentPaidTick,
  canPayRent,
  onClearLoan,
  loanClearedTick = 0,
  canClearLoan = false,
  initialGrnId,
  onBackToGrn,
  onClearInitialGrn,
}: IssueDeliveryChallanPanelProps) {
  const form = useCreateDeliveryForm(facilityId, onSuccess, initialGrnId);
  const { createGrnId, refreshRentGate } = form;

  useEffect(() => {
    void form.fetchAvailableGrns();
  }, [form.fetchAvailableGrns]);

  useEffect(() => {
    if (loanClearedTick > 0 && createGrnId) void form.fetchAvailableGrns();
  }, [loanClearedTick, createGrnId, form.fetchAvailableGrns]);

  useEffect(() => {
    if (rentPaidTick > 0 && createGrnId) void refreshRentGate(facilityId, createGrnId);
  }, [rentPaidTick, createGrnId, facilityId, refreshRentGate]);

  const handleCloseModal = () => {
    onClearInitialGrn?.();
    void form.handleSelectGrn('');
  };

  return (
    <div className={styles.issuePanel}>
      {form.modalError && <Banner message={form.modalError} />}

      <EligibleGrnSection
        grns={form.availableGrns}
        onSelectGrn={(id) => void form.handleSelectGrn(id)}
      />
      <div className={styles.stockFooter}>
        {onBackToGrn && (
          <Button
            id="issue-panel-back-btn"
            variant="outline"
            onClick={onBackToGrn}
            leftIcon={<ArrowLeft size={14} aria-hidden="true" />}
          >
            Back to Inward
          </Button>
        )}
        <Button variant="outline" onClick={onCancel}>
          Cancel
        </Button>
      </div>

      {form.selectedGrn && (
        <IssueDeliveryChallanModal
          form={form}
          facilityId={facilityId}
          isOpen={Boolean(form.selectedGrn)}
          onClose={handleCloseModal}
          onChangeGrn={handleCloseModal}
          onPayRent={onPayRent}
          canPayRent={canPayRent}
          onClearLoan={onClearLoan}
          canClearLoan={canClearLoan}
          onBackToGrn={onBackToGrn}
        />
      )}
    </div>
  );
}
