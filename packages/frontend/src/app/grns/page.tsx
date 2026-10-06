'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus } from 'lucide-react';
import { can, type Grn, type Role } from '@cold-storage/contracts';
import { FeedbackStates } from '@/components/ui/FeedbackStates';
import { Banner } from '@/components/ui/Banner';
import { Button } from '@/components/ui/Button';
import {
  EMPTY_MESSAGES,
  ERROR_TITLES,
  LOADING_LABELS,
  PRINT_MESSAGES,
  emptyForFacility,
} from '@/components/ui/stateCopy';
import { useAuth } from '@/context/AuthContext';
import { useFacility } from '@/context/FacilityContext';
import { printHtmlDocument } from '@/lib/print-document';
import { GrnFilterToolbar } from './components/GrnFilterToolbar';
import { GrnPageModals } from './components/GrnPageModals';
import { GrnTable } from './components/GrnTable';
import { useGrns } from './hooks/useGrns';
import styles from './page.module.css';

export default function GrnsPage() {
  const router = useRouter();
  const { user } = useAuth();
  const { selectedFacilityId, availableFacilities } = useFacility();
  const grnData = useGrns(selectedFacilityId, availableFacilities);

  const [selectedGrn, setSelectedGrn] = useState<Grn | null>(null);
  const [loanModalGrn, setLoanModalGrn] = useState<Grn | null>(null);
  const [correctModalGrn, setCorrectModalGrn] = useState<Grn | null>(null);
  const [internalMovementGrn, setInternalMovementGrn] = useState<Grn | null>(null);
  const [printingId, setPrintingId] = useState<string | null>(null);
  const [printError, setPrintError] = useState<string | null>(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  useEffect(() => {
    const handleSelectEvent = (e: Event) => {
      const customEvent = e as CustomEvent<Grn>;
      if (customEvent.detail) setSelectedGrn(customEvent.detail);
    };
    window.addEventListener('select-grn', handleSelectEvent);

    const params = new URLSearchParams(window.location.search);
    const targetGrnId = params.get('selectedGrnId');
    if (targetGrnId) {
      const match = grnData.grns.find((g) => g.id === targetGrnId);
      if (match) setSelectedGrn(match);
    }
    return () => window.removeEventListener('select-grn', handleSelectEvent);
  }, [grnData.grns]);

  const userRole = (user?.role ?? 'READ_ONLY') as Role;
  const canCreate = can(userRole, 'grn:create');
  const canPrint = can(userRole, 'document:print');
  const canManageLoan = can(userRole, 'grn:create');
  const canCorrect = can(userRole, 'grn:correct');
  const canCreateChallan = can(userRole, 'delivery:create');

  const handlePrint = async (type: 'grn' | 'receipt', grnId: string) => {
    if (!selectedFacilityId) return;
    setPrintingId(`${type}-${grnId}`);
    setPrintError(null);
    try {
      await printHtmlDocument({
        url: `/api/facilities/${encodeURIComponent(selectedFacilityId)}/documents/${type}/${encodeURIComponent(grnId)}`,
        popupBlockedMessage: PRINT_MESSAGES.popupBlocked,
        failureMessage: PRINT_MESSAGES.grnFailed,
      });
    } catch (err: unknown) {
      setPrintError(err instanceof Error ? err.message : PRINT_MESSAGES.grnFailed);
    } finally {
      setPrintingId(null);
    }
  };

  const handleCorrectGrn = (grn: Grn) => {
    setSelectedGrn(null);
    setCorrectModalGrn(grn);
  };

  const handleInternalMove = (grn: Grn) => {
    setSelectedGrn(null);
    setInternalMovementGrn(grn);
  };

  const handleCreateChallan = (grn: Grn) => {
    router.push(`/deliveries?action=create&grnId=${encodeURIComponent(grn.id)}`);
  };

  return (
    <div className={styles.page}>
      <div className={styles.headerRow}>
        <div className={styles.titleArea}>
          <h1 className={styles.pageTitle}>Inward of Goods</h1>
        </div>

        <div className={styles.headerActions}>
          {canCreate && selectedFacilityId && (
            <Button
              id="create-grn-header-btn"
              variant="primary"
              onClick={() => setIsCreateOpen(true)}
              leftIcon={<Plus size={16} aria-hidden="true" />}
            >
              Create Inward of Goods
            </Button>
          )}
        </div>
      </div>

      {printError && <Banner message={printError} />}

      {!selectedFacilityId ? (
        <FeedbackStates.Empty message={EMPTY_MESSAGES.noFacilityGrns} />
      ) : (
        <>
          <GrnFilterToolbar
            searchTerm={grnData.searchTerm}
            onSearchChange={grnData.setSearchTerm}
            statusFilter={grnData.statusFilter}
            onStatusChange={grnData.setStatusFilter}
            customerFilter={grnData.customerFilter}
            onCustomerChange={grnData.setCustomerFilter}
            commodityFilter={grnData.commodityFilter}
            onCommodityChange={grnData.setCommodityFilter}
            customers={grnData.customers}
            commodities={grnData.commodities}
            onReset={grnData.resetFilters}
          />

          {grnData.loading ? (
            <FeedbackStates.Loading label={LOADING_LABELS.grns} />
          ) : grnData.error ? (
            <FeedbackStates.Error
              title={ERROR_TITLES.grns}
              message={grnData.error}
              onRetry={() => void grnData.fetchGrns()}
            />
          ) : grnData.grns.length === 0 ? (
            grnData.searchTerm ? (
              <FeedbackStates.Empty
                message={`No Inward of Goods matching "${grnData.searchTerm}".`}
              />
            ) : grnData.statusFilter || grnData.customerFilter || grnData.commodityFilter ? (
              <FeedbackStates.Empty
                message="No Inward of Goods found matching the selected filters."
              />
            ) : (
              <FeedbackStates.Empty
                message={emptyForFacility(grnData.currentFacilityName, 'grns')}
                action={
                  canCreate
                    ? {
                        label: '+ Create Inward of Goods',
                        onClick: () => setIsCreateOpen(true),
                        id: 'create-grn-empty-btn',
                      }
                    : undefined
                }
              />
            )
          ) : (
            <GrnTable
              grns={grnData.filteredGrns}
              caption={`Inward of Goods for ${grnData.currentFacilityName}`}
              canPrint={canPrint}
              canCorrect={canCorrect}
              canCreateChallan={canCreateChallan}
              canInternalMove={canCorrect}
              printingId={printingId}
              page={grnData.page}
              pageSize={grnData.pageSize}
              totalPages={grnData.totalPages}
              totalGrns={grnData.totalGrns}
              onPageChange={grnData.setPage}
              onSelectGrn={setSelectedGrn}
              onCorrectGrn={handleCorrectGrn}
              onCreateChallan={handleCreateChallan}
              onInternalMove={handleInternalMove}
              onPrint={handlePrint}
            />
          )}
        </>
      )}

      <GrnPageModals
        selectedFacilityId={selectedFacilityId}
        selectedGrn={selectedGrn}
        loanModalGrn={loanModalGrn}
        correctModalGrn={correctModalGrn}
        internalMovementGrn={internalMovementGrn}
        isCreateOpen={isCreateOpen}
        canPrint={canPrint}
        canCorrect={canCorrect}
        canCreateChallan={canCreateChallan}
        canInternalMove={canCorrect}
        canManageLoan={canManageLoan}
        printingId={printingId}
        customers={grnData.customers}
        commodities={grnData.commodities}
        allGrns={grnData.grns}
        onCloseDetail={() => setSelectedGrn(null)}
        onCloseLoanModal={() => setLoanModalGrn(null)}
        onCloseCorrectModal={() => setCorrectModalGrn(null)}
        onCloseInternalMovementModal={() => setInternalMovementGrn(null)}
        onCloseCreateModal={() => setIsCreateOpen(false)}
        onPrint={handlePrint}
        onManageLoan={(grn) => {
          setSelectedGrn(null);
          setLoanModalGrn(grn);
        }}
        onCorrect={handleCorrectGrn}
        onCreateChallan={handleCreateChallan}
        onInternalMove={handleInternalMove}
        onLoanStatusUpdated={(updatedGrn) => {
          void grnData.fetchGrns();
          setSelectedGrn(updatedGrn);
        }}
        onGrnCorrected={(updatedGrn) => {
          setCorrectModalGrn(null);
          void grnData.fetchGrns();
          setSelectedGrn(updatedGrn);
        }}
        onInternalMovementSuccess={(updatedGrn) => {
          setInternalMovementGrn(null);
          void grnData.fetchGrns();
          setSelectedGrn(updatedGrn);
        }}
        onCustomerAdded={() => void grnData.fetchLookups()}
        onCommodityAdded={() => void grnData.fetchLookups()}
        onCreateSuccess={(newGrn) => {
          setIsCreateOpen(false);
          void grnData.fetchGrns();
          setSelectedGrn(newGrn);
        }}
      />
    </div>
  );
}
