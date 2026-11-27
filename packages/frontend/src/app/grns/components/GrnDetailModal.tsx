'use client';

import React, { useState, useEffect } from 'react';
import { Edit2 } from 'lucide-react';
import type { Grn, InternalMovementRecord } from '@cold-storage/contracts';
import { Button, Modal } from '@/components/ui';
import { requestWithAuth } from '@/lib/api-client';
import { GrnDetailAttributesGrid } from './GrnDetailAttributesGrid';
import { GrnDetailModalFooter } from './GrnDetailModalFooter';
import { GrnMergedDetailsTable } from './GrnMergedDetailsTable';
import { GrnOutwardDetailsTable } from './GrnOutwardDetailsTable';
import styles from '../page.module.css';

interface GrnDetailModalProps {
  grn: Grn;
  allGrns?: Grn[];
  onClose: () => void;
  canPrint: boolean;
  canCorrect?: boolean;
  canCreateChallan?: boolean;
  canInternalMove?: boolean;
  printingId: string | null;
  onPrint: (type: 'grn' | 'receipt', grnId: string) => void;
  onManageLoan?: (grn: Grn) => void;
  onCorrect?: (grn: Grn) => void;
  onCreateChallan?: (grn: Grn) => void;
  onInternalMove?: (grn: Grn) => void;
  onSortGrn?: (grn: Grn) => void;
}

export function GrnDetailModal({
  grn,
  allGrns = [],
  onClose,
  canPrint,
  canCorrect = false,
  canCreateChallan = false,
  canInternalMove = false,
  printingId,
  onPrint,
  onManageLoan,
  onCorrect,
  onCreateChallan,
  onInternalMove,
  onSortGrn,
}: GrnDetailModalProps) {
  const [movements, setMovements] = useState<InternalMovementRecord[] | null>(null);

  useEffect(() => {
    let active = true;
    if (!grn.facilityId || !grn.id) return;

    requestWithAuth(
      `/api/facilities/${encodeURIComponent(grn.facilityId)}/internal-movements/grn/${encodeURIComponent(grn.id)}`,
    )
      .then(async (res) => {
        if (!active) return;
        if (res.ok) {
          const data = (await res.json()) as { movements?: InternalMovementRecord[] };
          if (Array.isArray(data.movements)) {
            setMovements(data.movements);
          }
        }
      })
      .catch(() => {});

    return () => {
      active = false;
    };
  }, [grn.facilityId, grn.id]);

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={`Acknowledgement Details: ${grn.grnNumber}`}
      headerActions={
        canCorrect && onCorrect && grn.status !== 'CLOSED' ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onCorrect(grn)}
            aria-label="Edit GRN details"
            title={
              (grn.netDeliveredBags ?? 0) > 0
                ? 'Stock has moved — only chamber may be corrected once delivery has occurred'
                : 'Edit / Correct GRN details'
            }
            leftIcon={<Edit2 size={16} aria-hidden="true" />}
          />
        ) : null
      }
      size="lg"
      footer={
        <GrnDetailModalFooter
          grn={grn}
          onClose={onClose}
          canPrint={canPrint}
          canCreateChallan={canCreateChallan}
          canInternalMove={canInternalMove}
          printingId={printingId}
          onPrint={onPrint}
          onCreateChallan={onCreateChallan}
          onInternalMove={onInternalMove}
          onSortGrn={canCorrect ? onSortGrn : undefined}
          onManageLoan={onManageLoan}
        />
      }
    >
      <div className={styles.modalBody}>
        <GrnDetailAttributesGrid grn={grn} allGrns={allGrns} movements={movements} />
        <GrnMergedDetailsTable currentGrn={grn} allGrns={allGrns} movements={movements} />
        <GrnOutwardDetailsTable currentGrn={grn} />
      </div>
    </Modal>
  );
}
