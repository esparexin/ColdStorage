'use client';

import React, { useEffect, useState } from 'react';
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
import { requestWithAuth } from '@/lib/api-client';
import { CreateGrnModal } from './components/CreateGrnModal';
import { GrnDetailModal } from './components/GrnDetailModal';
import { GrnFilterToolbar } from './components/GrnFilterToolbar';
import { GrnTable } from './components/GrnTable';
import { UpdateLoanStatusModal } from './components/UpdateLoanStatusModal';
import { useGrns } from './hooks/useGrns';
import styles from './page.module.css';

export default function GrnsPage() {
  const { user } = useAuth();
  const { selectedFacilityId, availableFacilities } = useFacility();
  const grnData = useGrns(selectedFacilityId, availableFacilities);

  const [selectedGrn, setSelectedGrn] = useState<Grn | null>(null);
  const [loanModalGrn, setLoanModalGrn] = useState<Grn | null>(null);
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
      if (match) {
        setSelectedGrn(match);
      } else {
        void requestWithAuth(`/api/grns/${encodeURIComponent(targetGrnId)}`)
          .then((res) => (res.ok ? res.json() : null))
          .then((data: { grn?: Grn } | null) => {
            if (data?.grn) setSelectedGrn(data.grn);
          });
      }
    }
    return () => window.removeEventListener('select-grn', handleSelectEvent);
  }, [grnData.grns]);

  const userRole = (user?.role ?? 'READ_ONLY') as Role;
  const canCreate = can(userRole, 'grn:create');
  const canPrint = can(userRole, 'document:print');
  const canManageLoan = can(userRole, 'grn:create');

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
          ) : grnData.filteredGrns.length === 0 ? (
            <FeedbackStates.Empty
              message={`No Inward of Goods matching "${grnData.searchTerm}".`}
            />
          ) : (
            <GrnTable
              grns={grnData.filteredGrns}
              caption={`Inward of Goods for ${grnData.currentFacilityName}`}
              canPrint={canPrint}
              printingId={printingId}
              page={grnData.page}
              pageSize={grnData.pageSize}
              totalPages={grnData.totalPages}
              totalGrns={grnData.totalGrns}
              onPageChange={grnData.setPage}
              onSelectGrn={setSelectedGrn}
              onPrint={handlePrint}
            />
          )}
        </>
      )}

      {selectedGrn && (
        <GrnDetailModal
          grn={selectedGrn}
          onClose={() => setSelectedGrn(null)}
          canPrint={canPrint}
          printingId={printingId}
          onPrint={handlePrint}
          onManageLoan={
            canManageLoan
              ? (grn) => {
                  setSelectedGrn(null);
                  setLoanModalGrn(grn);
                }
              : undefined
          }
        />
      )}

      {loanModalGrn && selectedFacilityId && (
        <UpdateLoanStatusModal
          grn={loanModalGrn}
          facilityId={selectedFacilityId}
          onClose={() => setLoanModalGrn(null)}
          onSuccess={(updatedGrn) => {
            void grnData.fetchGrns();
            setSelectedGrn(updatedGrn);
          }}
        />
      )}

      {isCreateOpen && selectedFacilityId && (
        <CreateGrnModal
          facilityId={selectedFacilityId}
          customers={grnData.customers}
          commodities={grnData.commodities}
          onClose={() => setIsCreateOpen(false)}
          onCustomerAdded={() => void grnData.fetchLookups()}
          onCommodityAdded={() => void grnData.fetchLookups()}
          onSuccess={(newGrn) => {
            setIsCreateOpen(false);
            void grnData.fetchGrns();
            setSelectedGrn(newGrn);
          }}
        />
      )}
    </div>
  );
}
