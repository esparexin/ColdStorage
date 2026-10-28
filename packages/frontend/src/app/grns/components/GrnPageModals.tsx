'use client';

import React, { useEffect, useState } from 'react';
import type { Commodity, Customer, Grn, GrnMovementHistory } from '@cold-storage/contracts';
import { requestWithAuth } from '@/lib/api-client';
import { CreateGrnModal } from './CreateGrnModal';
import { GrnDetailModal } from './GrnDetailModal';
import { GrnSortingModal } from './GrnSortingModal';
import { InternalMovementModal } from './InternalMovementModal';
import { UpdateLoanStatusModal } from './UpdateLoanStatusModal';

interface GrnPageModalsProps {
  selectedFacilityId: string | null;
  selectedGrn: Grn | null;
  loanModalGrn: Grn | null;
  correctModalGrn: Grn | null;
  internalMovementGrn: Grn | null;
  sortModalGrn?: Grn | null;
  isCreateOpen: boolean;
  canPrint: boolean;
  canCorrect: boolean;
  canCreateChallan: boolean;
  canInternalMove: boolean;
  canManageLoan: boolean;
  printingId: string | null;
  customers: Customer[];
  commodities: Commodity[];
  allGrns: Grn[];
  onCloseDetail: () => void;
  onCloseLoanModal: () => void;
  onCloseCorrectModal: () => void;
  onCloseInternalMovementModal: () => void;
  onCloseSortModal?: () => void;
  onCloseCreateModal: () => void;
  onPrint: (type: 'grn' | 'receipt', grnId: string) => void;
  onManageLoan: (grn: Grn) => void;
  onCorrect: (grn: Grn) => void;
  onCreateChallan: (grn: Grn) => void;
  onInternalMove: (grn: Grn) => void;
  onSortGrn?: (grn: Grn) => void;
  onLoanStatusUpdated: (updatedGrn: Grn) => void;
  onGrnCorrected: (updatedGrn: Grn) => void;
  onInternalMovementSuccess: (updatedGrn: Grn) => void;
  onSortSuccess?: (updatedGrn: Grn) => void;
  onCustomerAdded: () => void;
  onCommodityAdded: () => void;
  onCreateSuccess: (newGrn: Grn) => void;
}

export function GrnPageModals({
  selectedFacilityId,
  selectedGrn,
  loanModalGrn,
  correctModalGrn,
  internalMovementGrn,
  sortModalGrn,
  isCreateOpen,
  canPrint,
  canCorrect,
  canCreateChallan,
  canInternalMove,
  canManageLoan,
  printingId,
  customers,
  commodities,
  allGrns,
  onCloseDetail,
  onCloseLoanModal,
  onCloseCorrectModal,
  onCloseInternalMovementModal,
  onCloseSortModal,
  onCloseCreateModal,
  onPrint,
  onManageLoan,
  onCorrect,
  onCreateChallan,
  onInternalMove,
  onSortGrn,
  onLoanStatusUpdated,
  onGrnCorrected,
  onInternalMovementSuccess,
  onSortSuccess,
  onCustomerAdded,
  onCommodityAdded,
  onCreateSuccess,
}: GrnPageModalsProps) {
  // Backend SSOT mirror for the correction guard: ANY challan/reversal history freezes
  // bags/commodity (even after full reversal); an active ISSUED challan blocks every
  // correction until reversed. Read from the existing movement-history API (grn:view,
  // held by every grn:correct holder) — no new endpoint. Null = loading/failed, and the
  // modal falls back to the conservative receipt-level heuristic.
  const [correctionGuard, setCorrectionGuard] = useState<{
    hasMovement: boolean;
    hasActiveIssued: boolean;
  } | null>(null);
  useEffect(() => {
    if (!correctModalGrn || !selectedFacilityId) {
      setCorrectionGuard(null);
      return;
    }
    let live = true;
    setCorrectionGuard(null);
    void (async () => {
      try {
        const res = await requestWithAuth(
          `/api/facilities/${encodeURIComponent(selectedFacilityId)}/grns/${encodeURIComponent(correctModalGrn.id)}/movement-history`,
        );
        if (!res.ok || !live) return;
        const data = (await res.json()) as { history: GrnMovementHistory };
        const entries = data.history.entries ?? [];
        const outward = entries.filter(
          (e) => e.type === 'PARTIAL_OUTWARD' || e.type === 'FINAL_OUTWARD',
        ).length;
        const reversed = entries.filter((e) => e.type === 'DELIVERY_REVERSAL').length;
        setCorrectionGuard({ hasMovement: outward + reversed > 0, hasActiveIssued: outward > reversed });
      } catch {
        // History unavailable: CreateGrnModal keeps the receipt-level heuristic.
      }
    })();
    return () => {
      live = false;
    };
  }, [correctModalGrn, selectedFacilityId]);
  return (
    <>
      {selectedGrn && (
        <GrnDetailModal
          grn={selectedGrn}
          allGrns={allGrns}
          onClose={onCloseDetail}
          canPrint={canPrint}
          canCorrect={canCorrect}
          canCreateChallan={canCreateChallan}
          canInternalMove={canInternalMove}
          printingId={printingId}
          onPrint={onPrint}
          onManageLoan={canManageLoan ? onManageLoan : undefined}
          onCorrect={canCorrect ? onCorrect : undefined}
          onCreateChallan={canCreateChallan ? onCreateChallan : undefined}
          onInternalMove={canInternalMove ? onInternalMove : undefined}
          onSortGrn={canCorrect ? onSortGrn : undefined}
        />
      )}

      {internalMovementGrn && selectedFacilityId && (
        <InternalMovementModal
          grn={internalMovementGrn}
          facilityId={selectedFacilityId}
          customers={customers}
          onClose={onCloseInternalMovementModal}
          onSuccess={onInternalMovementSuccess}
        />
      )}

      {sortModalGrn && selectedFacilityId && (
        <GrnSortingModal
          facilityId={selectedFacilityId}
          grn={sortModalGrn}
          commodities={commodities}
          isOpen={Boolean(sortModalGrn)}
          onClose={onCloseSortModal ?? (() => {})}
          onSuccess={onSortSuccess ?? (() => {})}
        />
      )}

      {correctModalGrn && selectedFacilityId && (
        <CreateGrnModal
          facilityId={selectedFacilityId}
          customers={customers}
          commodities={commodities}
          mode="edit"
          initialGrn={correctModalGrn}
          movementGuard={correctionGuard}
          onClose={onCloseCorrectModal}
          onSuccess={onGrnCorrected}
        />
      )}

      {loanModalGrn && selectedFacilityId && (
        <UpdateLoanStatusModal
          grn={loanModalGrn}
          facilityId={selectedFacilityId}
          onClose={onCloseLoanModal}
          onSuccess={onLoanStatusUpdated}
        />
      )}

      {isCreateOpen && selectedFacilityId && (
        <CreateGrnModal
          facilityId={selectedFacilityId}
          customers={customers}
          commodities={commodities}
          onClose={onCloseCreateModal}
          onCustomerAdded={onCustomerAdded}
          onCommodityAdded={onCommodityAdded}
          onSuccess={onCreateSuccess}
        />
      )}
    </>
  );
}
