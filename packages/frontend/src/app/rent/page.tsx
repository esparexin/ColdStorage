'use client';

import React, { useMemo, useState } from 'react';
import { type RentSummaryDto } from '@cold-storage/contracts';
import { Button } from '@/components/ui';
import { FeedbackStates } from '@/components/ui/FeedbackStates';
import {
  EMPTY_MESSAGES,
  ERROR_TITLES,
  LOADING_LABELS,
  emptyForFacility,
} from '@/components/ui/stateCopy';
import { usePermissions } from '@/hooks/usePermissions';
import { BatchCollectPaymentModal } from './components/BatchCollectPaymentModal';
import { CollectPaymentModal } from './components/CollectPaymentModal';
import { RentFilterToolbar } from './components/RentFilterToolbar';
import { RentHistoryModal } from './components/RentHistoryModal';
import { RentKpiCards } from './components/RentKpiCards';
import { RentStatusTabs } from './components/RentStatusTabs';
import { RentTable } from './components/RentTable';
import { getRentStatusCategory, isMergedRentAccount } from './hooks/rentFilter.helper';
import { useRentData } from './hooks/useRentData';
import styles from './page.module.css';

export default function RentPage() {
  const { hasPermission } = usePermissions();
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
  const [isBatchModalOpen, setIsBatchModalOpen] = useState(false);
  const canCollect = hasPermission('rent:collect');
  const canPrint = hasPermission('rent:print');

  const tabCounts = useMemo(() => {
    let unpaid = 0;
    let partiallyPaid = 0;
    let settled = 0;
    let noDues = 0;
    let merged = 0;

    for (const acc of rentSummaries) {
      if (isMergedRentAccount(acc)) {
        merged++;
      }
      const cat = getRentStatusCategory(acc);
      if (cat === 'UNPAID') unpaid++;
      else if (cat === 'PARTIALLY_PAID') partiallyPaid++;
      else if (cat === 'SETTLED') settled++;
      else if (cat === 'NO_DUES') noDues++;
    }

    return {
      all: rentSummaries.length,
      unpaid,
      partiallyPaid,
      settled,
      noDues,
      merged,
    };
  }, [rentSummaries]);

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
        {canCollect && selectedFacilityId && (
          <div className={styles.actionGroup}>
            <Button variant="secondary" onClick={() => setIsBatchModalOpen(true)}>
              Batch Settlement
            </Button>
          </div>
        )}
      </div>

      {!selectedFacilityId ? (
        <FeedbackStates.Empty message={EMPTY_MESSAGES.noFacilityRent} />
      ) : (
        <>
          <RentKpiCards metrics={metrics} />

          <RentStatusTabs
            statusFilter={statusFilter}
            onStatusChange={(status) => {
              setStatusFilter(status);
              setPage(1);
            }}
            counts={tabCounts}
          />

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

      {isBatchModalOpen && selectedFacilityId && (
        <BatchCollectPaymentModal
          accounts={rentSummaries}
          selectedFacilityId={selectedFacilityId}
          onClose={() => setIsBatchModalOpen(false)}
          onPaymentSuccess={() => {
            void fetchRentAccounts();
          }}
        />
      )}
    </div>
  );
}
