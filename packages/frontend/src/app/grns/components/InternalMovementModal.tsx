'use client';

import React, { useState } from 'react';
import { UserCheck } from 'lucide-react';
import type { Commodity, Customer, Grn, InternalMovementRecord, TransferPaymentDecision, TransferSettlementDetails } from '@cold-storage/contracts';
import { Banner, Button, Modal } from '@/components/ui';
import { requestWithAuth } from '@/lib/api-client';
import { formatApiErrorMessage, parseApiResponse } from '@/lib/api-response';
import { InternalMovementTransferTab } from './InternalMovementTransferTab';
import { TransferStep4Success } from './TransferStep4Success';
import { buildTransferPayload } from './internalMovementPayload.helper';
import styles from './InternalMovementModal.module.css';

interface InternalMovementModalProps {
  grn: Grn;
  facilityId: string;
  customers: Customer[];
  commodities?: Commodity[];
  onClose: () => void;
  onSuccess: (updatedGrn: Grn) => void;
  onCustomerAdded?: () => void;
}

export function InternalMovementModal({
  grn,
  facilityId,
  customers,
  commodities,
  onClose,
  onSuccess,
  onCustomerAdded,
}: InternalMovementModalProps) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [transferResult, setTransferResult] = useState<{
    grn: Grn;
    movement: InternalMovementRecord;
  } | null>(null);

  const handleRequestClose = () => {
    if (!submitting) {
      if (transferResult) {
        onSuccess(transferResult.grn);
      } else {
        onClose();
      }
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
    repack?: {
      destinationChamber?: string;
      resultingBagType?: import('@cold-storage/contracts').BagType;
      repackedSmallBags?: number;
      repackedBigBags?: number;
      repackedQuantity?: number;
      referenceWeight?: number;
    },
    fee?: {
      transferFeePerBag?: number;
      totalTransferFee?: number;
      feePaymentMode?: import('@cold-storage/contracts').PaymentMode;
      feePaidBy?: 'BUYER' | 'SELLER';
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
              repack,
              fee,
            ),
          ),
        },
      );
      const parsed = await parseApiResponse<{
        grn?: Grn;
        movement?: InternalMovementRecord;
      }>(res);
      if (!parsed.ok || !parsed.data.grn) {
        throw new Error(parsed.ok ? 'Ownership transfer failed' : formatApiErrorMessage(parsed));
      }
      if (parsed.data.movement) {
        setTransferResult({
          grn: parsed.data.grn,
          movement: parsed.data.movement,
        });
      } else {
        onSuccess(parsed.data.grn);
      }
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
          <UserCheck size={18} aria-hidden="true" />
          <span>Transfer Ownership: {grn.grnNumber}</span>
        </div>
      }
      subtitle={`Customer: ${grn.customerName} • ${grn.commodityName} • Chamber ${grn.chamber}`}
      size="xl"
      footer={
        transferResult ? null : (
          <div className={styles.modalFooter}>
            <Button variant="outline" size="sm" onClick={handleRequestClose} disabled={submitting}>
              Cancel
            </Button>
          </div>
        )
      }
    >
      <div className={styles.modalContent}>
        {error && <Banner message={error} />}
        {transferResult ? (
          <TransferStep4Success
            facilityId={facilityId}
            grn={transferResult.grn}
            movement={transferResult.movement}
            onDone={handleRequestClose}
          />
        ) : (
          <InternalMovementTransferTab
            currentGrn={grn}
            facilityId={facilityId}
            customers={customers}
            commodities={commodities}
            submitting={submitting}
            onExecuteTransfer={handleExecuteTransfer}
            onCustomerAdded={onCustomerAdded}
          />
        )}
      </div>
    </Modal>
  );
}
