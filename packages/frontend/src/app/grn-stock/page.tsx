'use client';

import React, { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Grn, GrnMovementHistory } from '@cold-storage/contracts';
import { FilterToolbar } from '@/components/ui';
import { Banner } from '@/components/ui/Banner';
import { DataTable } from '@/components/ui/DataTable';
import { FeedbackStates } from '@/components/ui/FeedbackStates';
import { ACCESS_MESSAGES, ERROR_TITLES } from '@/components/ui/stateCopy';
import { usePermissions } from '@/hooks/usePermissions';
import { requestWithAuth } from '@/lib/api-client';
import { useFacility } from '@/context/FacilityContext';
import { GrnStockMovementModal } from './components/GrnStockMovementModal';
import { GrnDeleteConfirmDialog } from './components/GrnDeleteConfirmDialog';
import { createGrnStockColumns } from './components/GrnStockColumns';
import { GrnStockStatusTabs } from './components/GrnStockStatusTabs';
import { useGrnStock } from './hooks/useGrnStock';
import styles from './page.module.css';

export default function GrnStockPage() {
  const router = useRouter();
  const { selectedFacilityId, availableFacilities } = useFacility();
  const { hasPermission } = usePermissions();
  const canViewGrnStock = hasPermission('grn:view');

  const {
    loading,
    error,
    searchTerm,
    setSearchTerm,
    statusFilter,
    setStatusFilter,
    page,
    setPage,
    pageSize,
    fetchGrns,
    filteredGrns,
    tabCounts,
    totalPages,
    pagedGrns,
    mergeInMap,
  } = useGrnStock({ selectedFacilityId, canViewGrnStock });

  const [selectedGrn, setSelectedGrn] = useState<Grn | null>(null);
  const [history, setHistory] = useState<GrnMovementHistory | null>(null);
  const [loadingLedger, setLoadingLedger] = useState(false);
  const [ledgerError, setLedgerError] = useState<string | null>(null);

  const [deleteTargetGrn, setDeleteTargetGrn] = useState<Grn | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const handleOpenMovement = async (grn: Grn) => {
    if (!selectedFacilityId) return;
    setSelectedGrn(grn);
    setHistory(null);
    setLoadingLedger(true);
    setLedgerError(null);

    try {
      const res = await requestWithAuth(
        `/api/facilities/${encodeURIComponent(selectedFacilityId)}/grns/${encodeURIComponent(grn.id)}/movement-history`,
      );
      if (!res.ok) throw new Error('Failed to load GRN stock movement');
      const data = (await res.json()) as { history: GrnMovementHistory };
      setHistory(data.history);
    } catch (err: unknown) {
      setLedgerError(err instanceof Error ? err.message : 'Error loading movement history');
    } finally {
      setLoadingLedger(false);
    }
  };

  const handleOpenMerge = (grn: Grn) => {
    router.push(`/grns/merge?sourceId=${encodeURIComponent(grn.id)}`);
  };

  const handleOpenDelete = (grn: Grn) => {
    setDeleteTargetGrn(grn);
    setDeleteOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!selectedFacilityId || !deleteTargetGrn) return;
    setDeleteError(null);
    try {
      const res = await requestWithAuth(
        `/api/facilities/${encodeURIComponent(selectedFacilityId)}/grns/${encodeURIComponent(deleteTargetGrn.id)}`,
        {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            grnId: deleteTargetGrn.id,
            confirmationToken: deleteTargetGrn.grnNumber,
            reason: `Testing-only deletion of GRN ${deleteTargetGrn.grnNumber}`,
          }),
        },
      );
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? 'GRN deletion failed');
      }
      setDeleteOpen(false);
      setDeleteTargetGrn(null);
      void fetchGrns();
    } catch (err: unknown) {
      setDeleteError(err instanceof Error ? err.message : 'GRN deletion failed');
    }
  };

  const currentFacilityName =
    availableFacilities.find((f) => f.id === selectedFacilityId)?.name || 'Cold Storage Facility';

  const columns = useMemo(
    () =>
      createGrnStockColumns({
        onOpenMovement: handleOpenMovement,
        onMerge: handleOpenMerge,
        onDelete: handleOpenDelete,
        mergeInMap,
      }),
    [selectedFacilityId, mergeInMap],
  );

  if (!canViewGrnStock) {
    return (
      <div className={styles.page}>
        <FeedbackStates.Error
          title={ERROR_TITLES.accessRestricted}
          message={ACCESS_MESSAGES.grnStock}
        />
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <div className={styles.headerRow}>
        <div className={styles.titleArea}>
          <h1 className={styles.pageTitle}>GRN Stock</h1>
          <span className={styles.pageSubtitle}>
            Customer bag stock and outward movement by GRN ({currentFacilityName})
          </span>
        </div>
      </div>

      {error && <Banner message={error} id="grn-stock-error" />}

      {!selectedFacilityId ? (
        <FeedbackStates.Empty message="Please select a facility from the header to view GRN Stock." />
      ) : (
        <>
          <GrnStockStatusTabs
            statusFilter={statusFilter}
            onStatusChange={(status) => {
              setStatusFilter(status);
              setPage(1);
            }}
            counts={tabCounts}
          />

          <FilterToolbar
            searchValue={searchTerm}
            onSearchChange={(v) => {
              setSearchTerm(v);
              setPage(1);
            }}
            searchPlaceholder="Search GRN #, Customer, Commodity..."
            searchAriaLabel="Search GRN Stock"
            searchInputId="grn-stock-search-input"
            onReset={() => {
              setSearchTerm('');
              setStatusFilter('');
              setPage(1);
            }}
            hasActiveFilters={Boolean(searchTerm || statusFilter)}
          />

          <DataTable
            columns={columns}
            rows={pagedGrns}
            rowKey={(row) => row.id}
            caption={`GRN Stock for ${currentFacilityName}`}
            loading={loading}
            loadingLabel="Loading GRN stock..."
            emptyMessage={
              searchTerm || statusFilter
                ? 'No GRN stock matches the current search filters.'
                : `No GRNs recorded for ${currentFacilityName} yet.`
            }
            pagination={{
              page,
              pageSize,
              totalPages,
              totalRecords: filteredGrns.length,
              onPageChange: setPage,
            }}
            onRowClick={handleOpenMovement}
          />
        </>
      )}

      {selectedGrn && (
        <GrnStockMovementModal
          selectedGrn={selectedGrn}
          history={history}
          loadingLedger={loadingLedger}
          ledgerError={ledgerError}
          onClose={() => setSelectedGrn(null)}
          onRetry={() => void handleOpenMovement(selectedGrn)}
        />
      )}

      <GrnDeleteConfirmDialog
        isOpen={deleteOpen}
        targetGrn={deleteTargetGrn}
        deleteError={deleteError}
        onConfirm={() => void handleConfirmDelete()}
        onCancel={() => setDeleteOpen(false)}
      />
    </div>
  );
}
