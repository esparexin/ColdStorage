'use client';

import React, { useEffect, useMemo, useState } from 'react';
import type { Grn, GrnMovementHistory, GrnStatus, RentSummaryDto } from '@cold-storage/contracts';
import { FilterToolbar } from '@/components/ui';
import { DataTable } from '@/components/ui/DataTable';
import { FeedbackStates } from '@/components/ui/FeedbackStates';
import { requestWithAuth } from '@/lib/api-client';
import { useFacility } from '@/context/FacilityContext';
import { BondPassbookModal } from './components/BondPassbookModal';
import { createBondLedgerColumns } from './components/bondLedgerColumns';
import styles from './page.module.css';

export default function BondLedgerPage() {
  const { selectedFacilityId, availableFacilities } = useFacility();

  const [grns, setGrns] = useState<Grn[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'' | GrnStatus>('');
  const [page, setPage] = useState(1);
  const pageSize = 20;

  const [selectedGrn, setSelectedGrn] = useState<Grn | null>(null);
  const [history, setHistory] = useState<GrnMovementHistory | null>(null);
  const [rentSummary, setRentSummary] = useState<RentSummaryDto | null>(null);
  const [loadingLedger, setLoadingLedger] = useState(false);
  const [ledgerError, setLedgerError] = useState<string | null>(null);

  const fetchGrns = async () => {
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
      if (!res.ok) throw new Error('Failed to load facility GRNs');
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
    setRentSummary(null);
  }, [selectedFacilityId]);

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
        (g.gpNumber && g.gpNumber.toLowerCase().includes(term))
      );
    });
  }, [grns, searchTerm, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredGrns.length / pageSize));
  const pagedGrns = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredGrns.slice(start, start + pageSize);
  }, [filteredGrns, page, pageSize]);

  const handleOpenLedger = async (grn: Grn) => {
    if (!selectedFacilityId) return;
    setSelectedGrn(grn);
    setHistory(null);
    setRentSummary(null);
    setLoadingLedger(true);
    setLedgerError(null);

    try {
      const [historyRes, rentRes] = await Promise.all([
        requestWithAuth(
          `/api/facilities/${encodeURIComponent(selectedFacilityId)}/grns/${encodeURIComponent(grn.id)}/movement-history`,
        ),
        requestWithAuth(
          `/api/facilities/${encodeURIComponent(selectedFacilityId)}/rent/grn/${encodeURIComponent(grn.id)}`,
        ),
      ]);

      if (!historyRes.ok) throw new Error('Failed to load bond movement history');
      const historyData = (await historyRes.json()) as { history: GrnMovementHistory };

      let rentDto: RentSummaryDto | null = null;
      if (rentRes.ok) {
        const rawRent = (await rentRes.json()) as RentSummaryDto | { summary?: RentSummaryDto };
        rentDto =
          rawRent && 'summary' in rawRent && rawRent.summary
            ? rawRent.summary
            : (rawRent as RentSummaryDto);
      }

      setHistory(historyData.history);
      setRentSummary(rentDto);
    } catch (err: unknown) {
      setLedgerError(err instanceof Error ? err.message : 'Error loading movement history');
    } finally {
      setLoadingLedger(false);
    }
  };

  const currentFacilityName =
    availableFacilities.find((f) => f.id === selectedFacilityId)?.name || 'Cold Storage Facility';

  const columns = useMemo(
    () => createBondLedgerColumns({ onOpenLedger: handleOpenLedger }),
    [selectedFacilityId],
  );

  return (
    <div className={styles.page}>
      <div className={styles.headerRow}>
        <div className={styles.titleArea}>
          <h1 className={styles.pageTitle}>Bond Ledger</h1>
          <span className={styles.pageSubtitle}>
            Outward movement passbook per Bond & Customer ({currentFacilityName})
          </span>
        </div>
      </div>

      {error && (
        <div className={`${styles.banner} ${styles.bannerError}`} role="alert">
          {error}
        </div>
      )}

      {!selectedFacilityId ? (
        <FeedbackStates.Empty message="Please select a facility from the header to view Bond Ledgers." />
      ) : (
        <>
          <FilterToolbar
            searchValue={searchTerm}
            onSearchChange={(v) => {
              setSearchTerm(v);
              setPage(1);
            }}
            searchPlaceholder="Search Customer, Bond / GRN #, Commodity, Chamber..."
            searchAriaLabel="Search Bond Ledgers"
            searchInputId="bond-search-input"
            selects={[
              {
                id: 'bond-status-filter',
                ariaLabel: 'Filter by Status',
                value: statusFilter,
                onChange: (v) => {
                  setStatusFilter(v as '' | GrnStatus);
                  setPage(1);
                },
                options: [
                  { value: '', label: 'All Statuses' },
                  { value: 'OPEN', label: 'Active (Open)' },
                  { value: 'CLOSED', label: 'Closed (Zero Balance)' },
                ],
              },
            ]}
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
            caption={`Bond Ledgers for ${currentFacilityName}`}
            loading={loading}
            loadingLabel="Loading customer bonds..."
            emptyMessage={
              searchTerm || statusFilter
                ? 'No customer bonds match the current search filters.'
                : `No customer bonds recorded for ${currentFacilityName} yet.`
            }
            pagination={{
              page,
              pageSize,
              totalPages,
              totalRecords: filteredGrns.length,
              onPageChange: setPage,
            }}
          />
        </>
      )}

      {selectedGrn && (
        <BondPassbookModal
          selectedGrn={selectedGrn}
          history={history}
          rentSummary={rentSummary}
          loadingLedger={loadingLedger}
          ledgerError={ledgerError}
          onClose={() => setSelectedGrn(null)}
          onRetry={() => void handleOpenLedger(selectedGrn)}
        />
      )}
    </div>
  );
}
