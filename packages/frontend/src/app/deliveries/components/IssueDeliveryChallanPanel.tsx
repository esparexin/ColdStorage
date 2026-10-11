'use client';

import React, { useEffect } from 'react';
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

  return (
    <div className={styles.issuePanel}>
      <div className={styles.issueHeader}>
        <h2 className={styles.issueTitle}>Issue Outward Delivery Challan</h2>
        <p className={styles.issueSubtitle}>
          Select an active Inward GRN with available stock to configure outward delivery.
        </p>
      </div>

      {form.modalError && <Banner message={form.modalError} />}

      <EligibleGrnSection
        grns={form.availableGrns}
        selectedGrnId={form.createGrnId}
        onSelectGrn={(id) => void form.handleSelectGrn(id)}
      />
      <div className={styles.stockFooter}>
        <Button variant="outline" onClick={onCancel}>
          Cancel
        </Button>
      </div>

      {form.selectedGrn && (
        <IssueDeliveryChallanModal
          form={form}
          facilityId={facilityId}
          isOpen={Boolean(form.selectedGrn)}
          onClose={() => void form.handleSelectGrn('')}
          onChangeGrn={() => void form.handleSelectGrn('')}
          onPayRent={onPayRent}
          canPayRent={canPayRent}
          onClearLoan={onClearLoan}
          canClearLoan={canClearLoan}
        />
      )}
    </div>
  );
}
