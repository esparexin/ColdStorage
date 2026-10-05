'use client';

import React, { useState } from 'react';
import { can, type PaymentStatus,
  type Role, type RentSummaryDto } from '@cold-storage/contracts';
import { FilterToolbar } from '@/components/ui';
import { FeedbackStates } from '@/components/ui/FeedbackStates';
import {
  EMPTY_MESSAGES,
  ERROR_TITLES,
  LOADING_LABELS,
  emptyForFacility,
} from '@/components/ui/stateCopy';
import { useAuth } from '@/context/AuthContext';
import { CollectPaymentModal } from './components/CollectPaymentModal';
import { RentHistoryModal } from './components/RentHistoryModal';
import { RentKpiCards } from './components/RentKpiCards';
import { RentTable } from './components/RentTable';
import { useRentData } from './hooks/useRentData';
import styles from './page.module.css';

export default function RentPage() {
  const { user } = useAuth();
  const {
    selectedFacilityId,
    currentFacilityName,
    rentSummaries,
    loading,
    error,
    searchTerm,
    setSearchTerm,
    statusFilter,
    setStatusFilter,
    metrics,
    pagedAccounts,
    totalAccounts,
    totalPages,
    page,
    setPage,
    pageSize,
    fetchRentAccounts,
  } = useRentData();

  const [collectAccount, setCollectAccount] = useState<RentSummaryDto | null>(null);
  const [historyAccount, setHistoryAccount] = useState<RentSummaryDto | null>(null);

  const userRole = (user?.role ?? 'READ_ONLY') as Role;
  const canCollect = can(userRole, 'rent:collect');
  const canPrint = can(userRole, 'rent:print');

  const handlePaymentSuccess = (summary?: RentSummaryDto) => {
    setCollectAccount(null);
    void fetchRentAccounts();
    if (summary) {
      setHistoryAccount(summary);
    }
  };

  return (
    <div className={styles.page}>
      <div className={styles.headerRow}>
        <div className={styles.titleArea}>
          <h1 className={styles.pageTitle}>Rent Billing & Payment Collection</h1>
        </div>
      </div>

      {!selectedFacilityId ? (
        <FeedbackStates.Empty message={EMPTY_MESSAGES.noFacilityRent} />
      ) : (
        <>
          <RentKpiCards metrics={metrics} />
          <FilterToolbar
            searchValue={searchTerm}
            onSearchChange={setSearchTerm}
            searchPlaceholder="Search GRN #, Customer, Mobile, Commodity..."
            searchAriaLabel="Search rent billing"
            searchInputId="rent-search-input"
            selects={[
              {
                id: 'rent-status-filter',
                ariaLabel: 'Filter by Payment Status',
                value: statusFilter,
                onChange: (v) => setStatusFilter(v as '' | PaymentStatus),
                options: [
                  { value: '', label: 'All Payment Statuses' },
                  { value: 'Not Settled', label: 'Not Settled (Pending Dues)' },
                  { value: 'Settled', label: 'Settled (Fully Paid)' },
                ],
              },
            ]}
            onReset={() => {
              setStatusFilter('');
              setSearchTerm('');
            }}
            hasActiveFilters={Boolean(statusFilter || searchTerm)}
          />

          {loading ? (
            <FeedbackStates.Loading label={LOADING_LABELS.rent} />
          ) : error ? (
            <FeedbackStates.Error
              title={ERROR_TITLES.rent}
              message={error}
              onRetry={() => void fetchRentAccounts()}
            />
          ) : rentSummaries.length === 0 ? (
            <FeedbackStates.Empty message={emptyForFacility(currentFacilityName, 'rent')} />
          ) : pagedAccounts.length === 0 ? (
            <FeedbackStates.Empty message={`No rent accounts matching "${searchTerm}".`} />
          ) : (
            <RentTable
              accounts={pagedAccounts}
              facilityName={currentFacilityName ?? ''}
              canCollect={canCollect}
              page={page}
              pageSize={pageSize}
              totalPages={totalPages}
              totalAccounts={totalAccounts}
              onPageChange={setPage}
              onOpenCollect={setCollectAccount}
              onOpenHistory={setHistoryAccount}
            />
          )}
        </>
      )}

      {collectAccount && selectedFacilityId && (
        <CollectPaymentModal
          account={collectAccount}
          selectedFacilityId={selectedFacilityId}
          canPrint={canPrint}
          onClose={() => setCollectAccount(null)}
          onPaymentSuccess={handlePaymentSuccess}
        />
      )}

      {historyAccount && selectedFacilityId && (
        <RentHistoryModal
          account={historyAccount}
          selectedFacilityId={selectedFacilityId}
          canPrint={canPrint}
          onClose={() => setHistoryAccount(null)}
        />
      )}
    </div>
  );
}
