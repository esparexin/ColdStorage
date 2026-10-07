'use client';

import React, { useState } from 'react';
import { can, type Role, type RentSummaryDto } from '@cold-storage/contracts';
import { FeedbackStates } from '@/components/ui/FeedbackStates';
import {
  EMPTY_MESSAGES,
  ERROR_TITLES,
  LOADING_LABELS,
  emptyForFacility,
} from '@/components/ui/stateCopy';
import { useAuth } from '@/context/AuthContext';
import { CollectPaymentModal } from './components/CollectPaymentModal';
import { RentFilterToolbar } from './components/RentFilterToolbar';
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
    typeFilter,
    setTypeFilter,
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
          <RentFilterToolbar
            searchTerm={searchTerm}
            onSearchChange={setSearchTerm}
            statusFilter={statusFilter}
            onStatusChange={setStatusFilter}
            typeFilter={typeFilter}
            onTypeChange={setTypeFilter}
            onReset={() => {
              setStatusFilter('');
              setTypeFilter('');
              setSearchTerm('');
            }}
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
            <FeedbackStates.Empty
              message={
                searchTerm || statusFilter || typeFilter
                  ? 'No rent accounts matching the selected filter criteria.'
                  : 'No rent accounts available.'
              }
            />
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
