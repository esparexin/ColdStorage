'use client';

import React, { useMemo, useState } from 'react';
import { type DeliveryChallan, type RentSummaryDto } from '@cold-storage/contracts';
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
import { useRentData } from './hooks/useRentData';
import styles from './page.module.css';

export default function RentPage() {
  const { hasPermission } = usePermissions();
  const {
    selectedFacilityId,
    currentFacilityName,
    rentSummaries,
    allBillRows,
    loading,
    error,
    searchTerm,
    setSearchTerm,
    statusFilter,
    setStatusFilter,
    typeFilter,
    setTypeFilter,
    metrics,
    pagedBillRows,
    totalRecords,
    totalPages,
    page,
    setPage,
    pageSize,
    fetchRentAccounts,
  } = useRentData();

  const [collectAccount, setCollectAccount] = useState<RentSummaryDto | null>(null);
  const [collectDelivery, setCollectDelivery] = useState<DeliveryChallan | null>(null);
  const [historyAccount, setHistoryAccount] = useState<RentSummaryDto | null>(null);
  const [historyDeliveryId, setHistoryDeliveryId] = useState<string | null>(null);
  const [isBatchModalOpen, setIsBatchModalOpen] = useState(false);
  const canCollect = hasPermission('rent:collect');
  const canPrint = hasPermission('rent:print');

  const tabCounts = useMemo(() => {
    let unpaid = 0;
    let partiallyPaid = 0;
    let settled = 0;

    for (const r of allBillRows) {
      if (r.remainingBalance === 0 && r.totalPaid > 0) settled++;
      else if (r.remainingBalance > 0 && r.totalPaid > 0) partiallyPaid++;
      else if (r.totalPaid === 0 && r.remainingBalance > 0) unpaid++;
    }

    return {
      all: allBillRows.length,
      unpaid,
      partiallyPaid,
      settled,
    };
  }, [allBillRows]);

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
          ) : pagedBillRows.length === 0 ? (
            <FeedbackStates.Empty
              message={
                searchTerm || statusFilter || typeFilter
                  ? 'No rent accounts matching the selected filter criteria.'
                  : 'No rent accounts available.'
              }
            />
          ) : (
            <RentTable
              rows={pagedBillRows}
              facilityName={currentFacilityName ?? ''}
              canCollect={canCollect}
              page={page}
              pageSize={pageSize}
              totalPages={totalPages}
              totalAccounts={totalRecords}
              onPageChange={setPage}
              onOpenCollect={(acc, del) => {
                setCollectAccount(acc);
                setCollectDelivery(
                  del
                    ? ({
                        ...del,
                        id: del.deliveryId,
                      } as unknown as DeliveryChallan)
                    : null,
                );
              }}
              onOpenHistory={(acc, delId) => {
                setHistoryAccount(acc);
                setHistoryDeliveryId(delId ?? null);
              }}
            />
          )}
        </>
      )}

      {collectAccount && selectedFacilityId && (
        <CollectPaymentModal
          account={collectAccount}
          delivery={collectDelivery}
          selectedFacilityId={selectedFacilityId}
          canPrint={canPrint}
          onClose={() => {
            setCollectAccount(null);
            setCollectDelivery(null);
          }}
          onPaymentSuccess={handlePaymentSuccess}
        />
      )}

      {historyAccount && selectedFacilityId && (
        <RentHistoryModal
          account={historyAccount}
          selectedDeliveryId={historyDeliveryId ?? undefined}
          selectedFacilityId={selectedFacilityId}
          canPrint={canPrint}
          canCollect={canCollect}
          onClose={() => {
            setHistoryAccount(null);
            setHistoryDeliveryId(null);
          }}
          onOpenCollect={(acc, del) => {
            setHistoryAccount(null);
            setHistoryDeliveryId(null);
            setCollectDelivery(del ?? null);
            setCollectAccount(acc);
          }}
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
