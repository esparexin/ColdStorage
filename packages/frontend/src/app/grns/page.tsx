'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { GitMerge, Plus } from 'lucide-react';
import { type Grn } from '@cold-storage/contracts';
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
import { usePermissions } from '@/hooks/usePermissions';
import { useFacility } from '@/context/FacilityContext';
import { printHtmlDocument } from '@/lib/print-document';
import { GrnFilterToolbar } from './components/GrnFilterToolbar';
import { GrnPageModals } from './components/GrnPageModals';
import { GrnStatusTabs } from './components/GrnStatusTabs';
import { GrnTable } from './components/GrnTable';
import { useGrns } from './hooks/useGrns';
import styles from './page.module.css';

export default function GrnsPage() {
  const { hasPermission } = usePermissions();
  const router = useRouter();  const { selectedFacilityId, availableFacilities } = useFacility();
  const grnData = useGrns(selectedFacilityId, availableFacilities);

  const [selectedGrn, setSelectedGrn] = useState<Grn | null>(null);
  const [loanModalGrn, setLoanModalGrn] = useState<Grn | null>(null);
  const [correctModalGrn, setCorrectModalGrn] = useState<Grn | null>(null);
  const [internalMovementGrn, setInternalMovementGrn] = useState<Grn | null>(null);
  const [sortModalGrn, setSortModalGrn] = useState<Grn | null>(null);
  const [printingId, setPrintingId] = useState<string | null>(null);
  const [printError, setPrintError] = useState<string | null>(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  const canCreate = hasPermission('grn:create');
  const canPrint = hasPermission('document:print');
  const canManageLoan = hasPermission('grn:create');
  const canCorrect = hasPermission('grn:correct');
  const canCreateChallan = hasPermission('delivery:create');

  const [pendingGrnId, setPendingGrnId] = useState<string | null>(null);

  useEffect(() => {
    const handleSelectEvent = (e: Event) => {
      const customEvent = e as CustomEvent<Grn>;
      if (customEvent.detail) setSelectedGrn(customEvent.detail);
    };
    const handleOpenCreateEvent = () => {
      if (canCreate) setIsCreateOpen(true);
    };
    window.addEventListener('select-grn', handleSelectEvent);
    window.addEventListener('open-create-grn', handleOpenCreateEvent);
    return () => {
      window.removeEventListener('select-grn', handleSelectEvent);
      window.removeEventListener('open-create-grn', handleOpenCreateEvent);
    };
  }, [canCreate]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    if (params.get('action') === 'create' && canCreate) setIsCreateOpen(true);
    const searchParam = params.get('search');
    if (searchParam) grnData.setSearchTerm(searchParam);
    const targetGrnId = params.get('selectedGrnId');
    if (targetGrnId) setPendingGrnId(targetGrnId);
  }, [canCreate, grnData.setSearchTerm]);

  useEffect(() => {
    if (!pendingGrnId || grnData.grns.length === 0) return;
    const match = grnData.grns.find((g) => g.id === pendingGrnId);
    if (match) {
      setSelectedGrn(match);
      setPendingGrnId(null);
    }
  }, [pendingGrnId, grnData.grns]);

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

  const handleCorrectGrn = (grn: Grn) => { setSelectedGrn(null); setCorrectModalGrn(grn); };
  const handleInternalMove = (grn: Grn) => { setSelectedGrn(null); setInternalMovementGrn(grn); };
  const handleSortGrn = (grn: Grn) => { setSelectedGrn(null); setSortModalGrn(grn); };
  const handleCreateChallan = (grn: Grn) => {
    setSelectedGrn(null);
    router.push(`/deliveries?tab=issue&grnId=${encodeURIComponent(grn.id)}`);
  };

  return (
    <div className={styles.page}>
      <div className={styles.headerRow}>
        <div className={styles.titleArea}>
          <h1 className={styles.pageTitle}>Inward of Goods</h1>
        </div>

        <div className={styles.headerActions}>
          {canCorrect && selectedFacilityId && (
            <Button
              id="merge-grns-header-btn"
              variant="outline"
              onClick={() => router.push('/grns/merge')}
              leftIcon={<GitMerge size={16} aria-hidden="true" />}
            >
              Merge GRNs
            </Button>
          )}
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
          <GrnStatusTabs
            currentTab={grnData.statusFilter}
            onTabChange={grnData.setStatusFilter}
            counts={grnData.tabCounts}
          />

          <GrnFilterToolbar
            searchTerm={grnData.searchTerm}
            onSearchChange={grnData.setSearchTerm}
            statusFilter={grnData.statusFilter}
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
          ) : grnData.filteredGrns.length === 0 ? (
            <FeedbackStates.Empty
              message={
                grnData.searchTerm
                  ? `No Inward of Goods matching "${grnData.searchTerm}".`
                  : grnData.statusFilter || grnData.customerFilter || grnData.commodityFilter
                    ? `No Inward of Goods found matching the selected filters${grnData.statusFilter ? ` (${grnData.statusFilter.replace('_', ' ')})` : ''}.`
                    : emptyForFacility(grnData.currentFacilityName, 'grns')
              }
              action={
                !grnData.searchTerm && !grnData.statusFilter && !grnData.customerFilter && !grnData.commodityFilter && canCreate
                  ? { label: '+ Create Inward of Goods', onClick: () => setIsCreateOpen(true), id: 'create-grn-empty-btn' }
                  : undefined
              }
            />
          ) : (
            <GrnTable
              grns={grnData.filteredGrns}
              caption={`Inward of Goods for ${grnData.currentFacilityName}`}
              isMergedTab={grnData.statusFilter === 'MERGED'}
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
              onSortGrn={handleSortGrn}
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
        sortModalGrn={sortModalGrn}
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
        onCloseDetail={() => setSelectedGrn(null)} onCloseLoanModal={() => setLoanModalGrn(null)}
        onCloseCorrectModal={() => setCorrectModalGrn(null)} onCloseInternalMovementModal={() => setInternalMovementGrn(null)}
        onCloseSortModal={() => setSortModalGrn(null)}
        onCloseCreateModal={() => setIsCreateOpen(false)} onPrint={handlePrint}
        onManageLoan={(grn) => { setSelectedGrn(null); setLoanModalGrn(grn); }}
        onCorrect={handleCorrectGrn} onCreateChallan={handleCreateChallan} onInternalMove={handleInternalMove}
        onSortGrn={handleSortGrn}
        onLoanStatusUpdated={(updatedGrn) => { void grnData.fetchGrns(); setSelectedGrn(updatedGrn); }}
        onGrnCorrected={(updatedGrn) => { setCorrectModalGrn(null); void grnData.fetchGrns(); setSelectedGrn(updatedGrn); }}
        onInternalMovementSuccess={(updatedGrn) => { setInternalMovementGrn(null); void grnData.fetchGrns(); setSelectedGrn(updatedGrn); }}
        onSortSuccess={(updatedGrn) => { setSortModalGrn(null); void grnData.fetchGrns(); setSelectedGrn(updatedGrn); }}
        onCustomerAdded={() => void grnData.fetchLookups()} onCommodityAdded={() => void grnData.fetchLookups()}
        onCreateSuccess={(newGrn) => { setIsCreateOpen(false); void grnData.fetchGrns(); setSelectedGrn(newGrn); }}
      />
    </div>
  );
}
