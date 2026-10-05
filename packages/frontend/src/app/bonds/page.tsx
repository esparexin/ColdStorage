'use client';

import React, { useEffect, useMemo, useState } from 'react';
import type { Grn, GrnStatus } from '@cold-storage/contracts';
import { FilterToolbar } from '@/components/ui';
import { Banner } from '@/components/ui/Banner';
import { DataTable } from '@/components/ui/DataTable';
import { FeedbackStates } from '@/components/ui/FeedbackStates';
import { requestWithAuth } from '@/lib/api-client';
import { useFacility } from '@/context/FacilityContext';
import { BondDetailsModal } from './components/BondDetailsModal';
import { createBondsColumns } from './components/bondsColumns';
import styles from './page.module.css';

export default function BondsPage() {
  const { selectedFacilityId, availableFacilities } = useFacility();

  const [grns, setGrns] = useState<Grn[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'' | GrnStatus | 'LOAN_ACTIVE' | 'LOAN_CLEARED'>('');
  const [page, setPage] = useState(1);
  const pageSize = 20;

  const [selectedGrn, setSelectedGrn] = useState<Grn | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  const fetchGrns = async () => {
    if (!selectedFacilityId) {
      setGrns([]);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      // Fetch all GRNs — filter client-side for isBondForLoan
      const res = await requestWithAuth(
        `/api/facilities/${encodeURIComponent(selectedFacilityId)}/grns?limit=100`,
      );
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? 'Failed to load facility GRNs');
      }
      const data = (await res.json()) as { items?: Grn[] };
      // Only GRNs that are pledged/bonded
      setGrns((data.items || []).filter((g) => g.isBondForLoan));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error loading bonds');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchGrns();
    setPage(1);
    setSelectedGrn(null);
  }, [selectedFacilityId]);

  const filteredGrns = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return grns.filter((g) => {
      if (statusFilter === 'LOAN_ACTIVE' && g.loanStatus !== 'TAKEN') return false;
      if (statusFilter === 'LOAN_CLEARED' && g.loanStatus !== 'CLEARED') return false;
      if (statusFilter === 'OPEN' && g.status !== 'OPEN') return false;
      if (statusFilter === 'CLOSED' && g.status !== 'CLOSED') return false;
      if (!term) return true;
      return (
        (Boolean(g.bondNumber) && g.bondNumber!.toLowerCase().includes(term)) ||
        g.grnNumber.toLowerCase().includes(term) ||
        g.customerName.toLowerCase().includes(term) ||
        (Boolean(g.loanBankName) && g.loanBankName!.toLowerCase().includes(term)) ||
        (Boolean(g.loanReferenceNumber) && g.loanReferenceNumber!.toLowerCase().includes(term))
      );
    });
  }, [grns, searchTerm, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredGrns.length / pageSize));
  const pagedGrns = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredGrns.slice(start, start + pageSize);
  }, [filteredGrns, page, pageSize]);

  // Bond details render from the already-loaded list entity, so opening a bond needs no
  // extra round-trip. Movement history is a GRN Stock concern and is not fetched here.
  const handleOpenDetail = (grn: Grn) => {
    setSelectedGrn(grn);
    setLoadingDetail(false);
    setDetailError(null);
  };

  const currentFacilityName =
    availableFacilities.find((f) => f.id === selectedFacilityId)?.name || 'Cold Storage Facility';

  const columns = useMemo(
    () => createBondsColumns({ onOpenDetail: handleOpenDetail }),
    [selectedFacilityId],
  );

  return (
    <div className={styles.page}>
      <div className={styles.headerRow}>
        <div className={styles.titleArea}>
          <h1 className={styles.pageTitle}>Bonds</h1>
          <span className={styles.pageSubtitle}>
            Bond / Lien details by customer and GRN ({currentFacilityName})
          </span>
        </div>
      </div>

      {error && <Banner message={error} id="bonds-error" />}

      {!selectedFacilityId ? (
        <FeedbackStates.Empty message="Please select a facility from the header to view Bonds." />
      ) : (
        <>
          <FilterToolbar
            searchValue={searchTerm}
            onSearchChange={(v) => {
              setSearchTerm(v);
              setPage(1);
            }}
            searchPlaceholder="Search Customer, Bond #, GRN #, Lien Holder, Reference..."
            searchAriaLabel="Search Bonds"
            searchInputId="bonds-search-input"
            selects={[
              {
                id: 'bonds-status-filter',
                ariaLabel: 'Filter by Bond Status',
                value: statusFilter,
                onChange: (v) => {
                  setStatusFilter(v as typeof statusFilter);
                  setPage(1);
                },
                options: [
                  { value: '', label: 'All Bonds' },
                  { value: 'LOAN_ACTIVE', label: 'Loan Active (Hold)' },
                  { value: 'LOAN_CLEARED', label: 'Loan Cleared' },
                  { value: 'OPEN', label: 'GRN Open' },
                  { value: 'CLOSED', label: 'GRN Closed' },
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
            caption={`Bond / Lien Details for ${currentFacilityName}`}
            loading={loading}
            loadingLabel="Loading bonds..."
            emptyMessage={
              searchTerm || statusFilter
                ? 'No bonds match the current search filters.'
                : `No bond GRNs recorded for ${currentFacilityName} yet.`
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
        <BondDetailsModal
          selectedGrn={selectedGrn}
          loadingDetail={loadingDetail}
          detailError={detailError}
          onClose={() => setSelectedGrn(null)}
          onRetry={() => handleOpenDetail(selectedGrn)}
        />
      )}
    </div>
  );
}
