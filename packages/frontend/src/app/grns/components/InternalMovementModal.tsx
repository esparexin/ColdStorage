'use client';

import React, { useState } from 'react';
import { ArrowRightLeft, GitMerge, UserCheck } from 'lucide-react';
import type { Customer, Grn } from '@cold-storage/contracts';
import { Banner, Button, Modal } from '@/components/ui';
import { requestWithAuth } from '@/lib/api-client';
import { InternalMovementMergeTab } from './InternalMovementMergeTab';
import { InternalMovementTransferTab } from './InternalMovementTransferTab';
import styles from './InternalMovementModal.module.css';

interface InternalMovementModalProps {
  grn: Grn;
  facilityId: string;
  allGrns: Grn[];
  customers: Customer[];
  onClose: () => void;
  onSuccess: (updatedGrn: Grn) => void;
}

export function InternalMovementModal({
  grn,
  facilityId,
  allGrns,
  customers,
  onClose,
  onSuccess,
}: InternalMovementModalProps) {
  const [activeTab, setActiveTab] = useState<'merge' | 'transfer'>('merge');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleExecuteMerge = async (
    targetGrnId: string,
    sourceGrnIds: string[],
    reason: string,
    remarks?: string,
  ) => {
    setSubmitting(true);
    setError(null);
    try {
      const res = await requestWithAuth(
        `/api/facilities/${encodeURIComponent(facilityId)}/internal-movements/merge`,
        {
          method: 'POST',
          body: JSON.stringify({ targetGrnId, sourceGrnIds, reason, remarks }),
        },
      );
      const data = (await res.json()) as { error?: string; targetGrn?: Grn };
      if (!res.ok || !data.targetGrn) {
        throw new Error(data.error || 'GRN Merge failed');
      }
      onSuccess(data.targetGrn);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Internal Movement Merge failed');
    } finally {
      setSubmitting(false);
    }
  };

  const handleExecuteTransfer = async (
    newCustomerId: string,
    effectiveDate: string | undefined,
    reason: string,
    remarks?: string,
  ) => {
    setSubmitting(true);
    setError(null);
    try {
      const res = await requestWithAuth(
        `/api/facilities/${encodeURIComponent(facilityId)}/internal-movements/transfer-ownership`,
        {
          method: 'POST',
          body: JSON.stringify({
            grnId: grn.id,
            newCustomerId,
            effectiveDate,
            reason,
            remarks,
          }),
        },
      );
      const data = (await res.json()) as { error?: string; grn?: Grn };
      if (!res.ok || !data.grn) {
        throw new Error(data.error || 'Ownership transfer failed');
      }
      onSuccess(data.grn);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Ownership transfer failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
          <ArrowRightLeft size={18} aria-hidden="true" />
          <span>Internal Movement: {grn.grnNumber}</span>
        </div>
      }
      subtitle={`Customer: ${grn.customerName} • ${grn.commodityName} • Chamber ${grn.chamber}`}
      size="xl"
      footer={
        <div className={styles.modalFooter}>
          <Button variant="outline" size="sm" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          {activeTab === 'merge' ? (
            <Button
              type="submit"
              form="merge-grn-form"
              variant="primary"
              size="sm"
              isLoading={submitting}
              disabled={submitting}
            >
              Execute Merge
            </Button>
          ) : (
            <Button
              type="submit"
              form="transfer-ownership-form"
              variant="primary"
              size="sm"
              isLoading={submitting}
              disabled={submitting}
            >
              Transfer Ownership
            </Button>
          )}
        </div>
      }
    >
      <div className={styles.modalContent}>
        {error && <Banner message={error} />}

        <nav className={styles.tabNav} aria-label="Internal Movement Modes">
          <Button
            type="button"
            variant={activeTab === 'merge' ? 'primary' : 'outline'}
            size="sm"
            onClick={() => {
              setActiveTab('merge');
              setError(null);
            }}
            disabled={submitting}
            leftIcon={<GitMerge size={14} aria-hidden="true" />}
          >
            1. Merge into Existing GRN
          </Button>
          <Button
            type="button"
            variant={activeTab === 'transfer' ? 'primary' : 'outline'}
            size="sm"
            onClick={() => {
              setActiveTab('transfer');
              setError(null);
            }}
            disabled={submitting}
            leftIcon={<UserCheck size={14} aria-hidden="true" />}
          >
            2. Transfer Ownership
          </Button>
        </nav>

        {activeTab === 'merge' ? (
          <InternalMovementMergeTab
            currentGrn={grn}
            allGrns={allGrns}
            submitting={submitting}
            onExecuteMerge={handleExecuteMerge}
          />
        ) : (
          <InternalMovementTransferTab
            currentGrn={grn}
            facilityId={facilityId}
            customers={customers}
            submitting={submitting}
            onExecuteTransfer={handleExecuteTransfer}
          />
        )}
      </div>
    </Modal>
  );
}
