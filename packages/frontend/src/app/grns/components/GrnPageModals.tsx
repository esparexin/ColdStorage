'use client';

import React from 'react';
import type { Commodity, Customer, Grn } from '@cold-storage/contracts';
import { CorrectGrnModal } from './CorrectGrnModal';
import { CreateGrnModal } from './CreateGrnModal';
import { GrnDetailModal } from './GrnDetailModal';
import { InternalMovementModal } from './InternalMovementModal';
import { UpdateLoanStatusModal } from './UpdateLoanStatusModal';

interface GrnPageModalsProps {
  selectedFacilityId: string | null;
  selectedGrn: Grn | null;
  loanModalGrn: Grn | null;
  correctModalGrn: Grn | null;
  internalMovementGrn: Grn | null;
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
  onCloseCreateModal: () => void;
  onPrint: (type: 'grn' | 'receipt', grnId: string) => void;
  onManageLoan: (grn: Grn) => void;
  onCorrect: (grn: Grn) => void;
  onCreateChallan: (grn: Grn) => void;
  onInternalMove: (grn: Grn) => void;
  onLoanStatusUpdated: (updatedGrn: Grn) => void;
  onGrnCorrected: (updatedGrn: Grn) => void;
  onInternalMovementSuccess: (updatedGrn: Grn) => void;
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
  onCloseCreateModal,
  onPrint,
  onManageLoan,
  onCorrect,
  onCreateChallan,
  onInternalMove,
  onLoanStatusUpdated,
  onGrnCorrected,
  onInternalMovementSuccess,
  onCustomerAdded,
  onCommodityAdded,
  onCreateSuccess,
}: GrnPageModalsProps) {
  return (
    <>
      {selectedGrn && (
        <GrnDetailModal
          grn={selectedGrn}
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
        />
      )}

      {internalMovementGrn && selectedFacilityId && (
        <InternalMovementModal
          grn={internalMovementGrn}
          facilityId={selectedFacilityId}
          allGrns={allGrns}
          customers={customers}
          onClose={onCloseInternalMovementModal}
          onSuccess={onInternalMovementSuccess}
        />
      )}

      {correctModalGrn && selectedFacilityId && (
        <CorrectGrnModal
          grn={correctModalGrn}
          facilityId={selectedFacilityId}
          commodities={commodities}
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
