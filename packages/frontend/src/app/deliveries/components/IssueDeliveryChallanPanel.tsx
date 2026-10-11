'use client';

import React, { useCallback, useEffect, useState } from 'react';
import type { DeliveryChallan, DeliverySummary, Grn, RentSummaryDto } from '@cold-storage/contracts';
import { Button } from '@/components/ui';
import { Banner } from '@/components/ui/Banner';
import { FeedbackStates } from '@/components/ui/FeedbackStates';
import { LOADING_LABELS } from '@/components/ui/stateCopy';
import { requestWithAuth } from '@/lib/api-client';
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
  const [selectedGrnId, setSelectedGrnId] = useState<string | null>(initialGrnId ?? null);
  const [availableGrns, setAvailableGrns] = useState<Grn[]>([]);
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const fetchGrns = useCallback(async () => {
    if (!facilityId) return;
    setLoading(true);
    setFetchError(null);
    try {
      const res = await requestWithAuth(
        `/api/facilities/${encodeURIComponent(facilityId)}/grns?status=ACTIVE&limit=100`,
      );
      if (!res.ok) throw new Error('Failed to load eligible GRNs');
      const data = (await res.json()) as { items?: Grn[] };
      setAvailableGrns(data.items || []);
    } catch (err: unknown) {
      setFetchError(err instanceof Error ? err.message : 'Failed to load eligible stock');
    } finally {
      setLoading(false);
    }
  }, [facilityId]);

  useEffect(() => {
    void fetchGrns();
  }, [fetchGrns]);

  useEffect(() => {
    if (loanClearedTick > 0) void fetchGrns();
  }, [loanClearedTick, fetchGrns]);

  useEffect(() => {
    if (initialGrnId) setSelectedGrnId(initialGrnId);
  }, [initialGrnId]);

  return (
    <div className={styles.issuePanel}>
      <div className={styles.issueHeader}>
        <h2 className={styles.issueTitle}>Issue Outward Delivery Challan</h2>
        <p className={styles.issueSubtitle}>
          Select an active Inward GRN with available stock to configure outward delivery.
        </p>
      </div>

      {fetchError && <Banner message={fetchError} />}

      {loading ? (
        <FeedbackStates.Loading label={LOADING_LABELS.data} />
      ) : (
        <>
          <EligibleGrnSection
            grns={availableGrns}
            selectedGrnId={selectedGrnId ?? undefined}
            onSelectGrn={(id) => setSelectedGrnId(id)}
          />
          <div className={styles.stockFooter}>
            <Button variant="outline" onClick={onCancel}>
              Cancel
            </Button>
          </div>
        </>
      )}

      {selectedGrnId && (
        <IssueDeliveryChallanModal
          facilityId={facilityId}
          isOpen={Boolean(selectedGrnId)}
          initialGrnId={selectedGrnId}
          onClose={() => setSelectedGrnId(null)}
          onChangeGrn={() => setSelectedGrnId(null)}
          onSuccess={(del, summary) => {
            setSelectedGrnId(null);
            onSuccess(del, summary);
          }}
          onPayRent={onPayRent}
          rentPaidTick={rentPaidTick}
          canPayRent={canPayRent}
          onClearLoan={onClearLoan}
          loanClearedTick={loanClearedTick}
          canClearLoan={canClearLoan}
        />
      )}
    </div>
  );
}
