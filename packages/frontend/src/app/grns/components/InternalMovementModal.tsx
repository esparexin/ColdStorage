'use client';

import React, { useState } from 'react';
import { ArrowRightLeft, GitMerge, UserCheck } from 'lucide-react';
import type { Commodity, Customer, Grn, TransferPaymentDecision, TransferSettlementDetails } from '@cold-storage/contracts';
import { Banner, Button, Modal } from '@/components/ui';
import { requestWithAuth } from '@/lib/api-client';
import { formatApiErrorMessage, parseApiResponse } from '@/lib/api-response';
import { InternalMovementMergeTab } from './InternalMovementMergeTab';
import { InternalMovementTransferTab } from './InternalMovementTransferTab';
import { buildMergePayload, buildTransferPayload } from './internalMovementPayload.helper';
import { useOpenFacilityGrns } from '../hooks/useOpenFacilityGrns';
import styles from './InternalMovementModal.module.css';

interface InternalMovementModalProps {
  grn: Grn;
  facilityId: string;
  allGrns: Grn[];
  customers: Customer[];
  commodities?: Commodity[];
  onClose: () => void;
  onSuccess: (updatedGrn: Grn) => void;
}

export function InternalMovementModal({
  grn,
  facilityId,
  allGrns,
  customers,
  commodities,
  onClose,
  onSuccess,
}: InternalMovementModalProps) {
  const [activeTab, setActiveTab] = useState<'merge' | 'transfer'>('merge');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const openFacilityGrns = useOpenFacilityGrns(facilityId, grn, allGrns);

  const handleRequestClose = () => { if (!submitting) onClose(); };

  const handleExecuteMerge = async (
    targetGrnId: string, sourceGrnIds: string[], reason: string, remarks?: string,
    movementDate?: string, additionalRentAmount?: number, repackedSmallBags?: number,
    repackedBigBags?: number, referenceWeight?: number, sourcePaymentAmount?: number,
    sourcePaymentMode?: import('@cold-storage/contracts').PaymentMode, sourceBagCategory?: import('@cold-storage/contracts').OutwardBagCategory,
    sourceQuantity?: number, sourceBagPrice?: number, sourceSeasonalBagPrice?: number,
    sourceMonthlyBagPrice?: number, isRepackSelected?: boolean, repackedBagCount?: number,
  ) => {
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await requestWithAuth(
        `/api/facilities/${encodeURIComponent(facilityId)}/internal-movements/merge`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(
            buildMergePayload(
              targetGrnId, sourceGrnIds, reason, remarks, movementDate, additionalRentAmount,
              repackedSmallBags, repackedBigBags, referenceWeight, sourcePaymentAmount, sourcePaymentMode,
              sourceBagCategory, sourceQuantity, sourceBagPrice, sourceSeasonalBagPrice, sourceMonthlyBagPrice,
              isRepackSelected, repackedBagCount,
            ),
          ),
        },
      );
      const parsed = await parseApiResponse<{ targetGrn?: Grn }>(res);
      if (!parsed.ok || !parsed.data.targetGrn) {
        throw new Error(parsed.ok ? 'GRN Merge failed' : formatApiErrorMessage(parsed));
      }
      onSuccess(parsed.data.targetGrn);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Internal Movement Merge failed');
    } finally {
      setSubmitting(false);
    }
  };

  const handleExecuteTransfer = async (
    newCustomerId: string,
    movementDate: string,
    reason: string,
    remarks?: string,
    paymentDecision?: TransferPaymentDecision,
    settlementDetails?: TransferSettlementDetails,
    confirmation?: {
      confirmedSmallBags?: number;
      confirmedBigBags?: number;
      sourceBagCategory?: import('@cold-storage/contracts').OutwardBagCategory;
      sourceQuantity?: number;
      sourceBagPrice?: number;
      sourceSeasonalBagPrice?: number;
      sourceMonthlyBagPrice?: number;
    },
  ) => {
    setSubmitting(true);
    setError(null);
    try {
      const res = await requestWithAuth(
        `/api/facilities/${encodeURIComponent(facilityId)}/internal-movements/transfer-ownership`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(
            buildTransferPayload(
              grn.id,
              newCustomerId,
              reason,
              remarks,
              movementDate,
              paymentDecision,
              settlementDetails,
              confirmation,
            ),
          ),
        },
      );
      const parsed = await parseApiResponse<{ grn?: Grn }>(res);
      if (!parsed.ok || !parsed.data.grn) {
        throw new Error(parsed.ok ? 'Ownership transfer failed' : formatApiErrorMessage(parsed));
      }
      onSuccess(parsed.data.grn);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Ownership transfer failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen
      onClose={handleRequestClose}
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
          <Button variant="outline" size="sm" onClick={handleRequestClose} disabled={submitting}>
            Cancel
          </Button>
        </div>
      }
    >
      <div className={styles.modalContent}>
        {error && <Banner message={error} />}

        <div className={styles.tabNav} role="tablist" aria-label="Internal Movement Modes">
          <Button
            type="button"
            role="tab"
            aria-selected={activeTab === 'merge'}
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
            role="tab"
            aria-selected={activeTab === 'transfer'}
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
        </div>

        {activeTab === 'merge' ? (
          <InternalMovementMergeTab
            currentGrn={grn} facilityId={facilityId} allGrns={openFacilityGrns}
            commodities={commodities} submitting={submitting} onExecuteMerge={handleExecuteMerge}
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
