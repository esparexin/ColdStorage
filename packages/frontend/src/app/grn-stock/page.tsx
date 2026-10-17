'use client';

import React, { useEffect, useMemo, useState } from 'react';
import type { Grn, GrnMovementHistory, GrnStatus } from '@cold-storage/contracts';
import { FilterToolbar } from '@/components/ui';
import { Banner } from '@/components/ui/Banner';
import { DataTable } from '@/components/ui/DataTable';
import { FeedbackStates } from '@/components/ui/FeedbackStates';
import { ACCESS_MESSAGES, ERROR_TITLES } from '@/components/ui/stateCopy';
import { usePermissions } from '@/hooks/usePermissions';
import { requestWithAuth } from '@/lib/api-client';
import { useFacility } from '@/context/FacilityContext';
import { GrnStockMovementModal } from './components/GrnStockMovementModal';
import { createGrnStockColumns } from './components/GrnStockColumns';
import { GrnStockStatusTabs } from './components/GrnStockStatusTabs';
import styles from './page.module.css';

export default function GrnStockPage() {
  const { selectedFacilityId, availableFacilities } = useFacility();
  const { hasPermission } = usePermissions();
  const canViewGrnStock = hasPermission('grn:view');

  const [grns, setGrns] = useState<Grn[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'' | GrnStatus>('');
  const [page, setPage] = useState(1);
  const pageSize = 20;

  const [selectedGrn, setSelectedGrn] = useState<Grn | null>(null);
  const [history, setHistory] = useState<GrnMovementHistory | null>(null);
  const [loadingLedger, setLoadingLedger] = useState(false);
  const [ledgerError, setLedgerError] = useState<string | null>(null);

  const fetchGrns = async () => {
    if (!canViewGrnStock) {
      setGrns([]);
      return;
    }
    if (!selectedFacilityId) {
      setGrns([]);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const res = await requestWithAuth(
        `/api/facilities/${encodeURIComponent(selectedFacilityId)}/grns?limit=100`,
      );
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? 'Failed to load facility GRNs');
      }
      const data = (await res.json()) as { items?: Grn[] };
      setGrns(data.items || []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error loading GRNs');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchGrns();
    setPage(1);
    setSelectedGrn(null);
    setHistory(null);
  }, [selectedFacilityId, canViewGrnStock]);

  const filteredGrns = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return grns.filter((g) => {
      if (statusFilter && g.status !== statusFilter) return false;
      if (!term) return true;
      return (
        g.grnNumber.toLowerCase().includes(term) ||
        g.customerName.toLowerCase().includes(term) ||
        g.commodityName.toLowerCase().includes(term) ||
        g.chamber.toLowerCase().includes(term) ||
        (Boolean(g.gpNumber) && g.gpNumber!.toLowerCase().includes(term))
      );
    });
  }, [grns, searchTerm, statusFilter]);

  const tabCounts = useMemo(() => {
    let open = 0;
    let closed = 0;
    for (const g of grns) {
      if (g.status === 'CLOSED') closed++;
      else open++;
    }
    return { all: grns.length, open, closed };
  }, [grns]);

  const totalPages = Math.max(1, Math.ceil(filteredGrns.length / pageSize));
  const pagedGrns = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredGrns.slice(start, start + pageSize);
  }, [filteredGrns, page, pageSize]);

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

  const currentFacilityName =
    availableFacilities.find((f) => f.id === selectedFacilityId)?.name || 'Cold Storage Facility';

  const mergeInMap = useMemo(() => {
    const map = new Map<string, { sourceNumbers: string[]; date: string | Date | null }>();
    for (const g of grns) {
      const targetNumber = g.mergedIntoGrnNumber;
      const targetId = g.mergedIntoGrnId;
      if (!targetNumber && !targetId) continue;

      const match = g.remarks?.match(/on\s+(\d{4}-\d{2}-\d{2})/);
      const dateVal = match?.[1] ?? g.updatedAt ?? null;

      const keys = [targetNumber, targetId].filter(Boolean) as string[];
      for (const k of keys) {
        const existing = map.get(k) || { sourceNumbers: [], date: dateVal };
        if (!existing.sourceNumbers.includes(g.grnNumber)) {
          existing.sourceNumbers.push(g.grnNumber);
        }
        if (!existing.date && dateVal) {
          existing.date = dateVal;
        }
        map.set(k, existing);
      }
    }
    return map;
  }, [grns]);

  const columns = useMemo(
    () => createGrnStockColumns({ onOpenMovement: handleOpenMovement, mergeInMap }),
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
    </div>
  );
}
