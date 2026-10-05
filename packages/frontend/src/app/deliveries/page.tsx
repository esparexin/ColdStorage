'use client';

import React, { useState } from 'react';
import { Plus } from 'lucide-react';
import { can, type DeliveryChallan, type DeliveryStatus, type Grn,
  type Role, type RentSummaryDto } from '@cold-storage/contracts';
import { FeedbackStates } from '@/components/ui/FeedbackStates';
import { Banner } from '@/components/ui/Banner';
import { Button, FilterToolbar } from '@/components/ui';
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
import { DeliveryPageModals } from './components/DeliveryPageModals';
import { DeliveryTable } from './components/DeliveryTable';
import { useDeliveries } from './hooks/useDeliveries';
import styles from './page.module.css';

export default function DeliveriesPage() {
  const { user } = useAuth();
  const { selectedFacilityId, availableFacilities } = useFacility();
  const deliveryData = useDeliveries(selectedFacilityId, availableFacilities);

  const [selectedDelivery, setSelectedDelivery] = useState<DeliveryChallan | null>(null);
  const [printingId, setPrintingId] = useState<string | null>(null);
  const [printError, setPrintError] = useState<string | null>(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [reverseDelivery, setReverseDelivery] = useState<DeliveryChallan | null>(null);
  const [rentPayAccount, setRentPayAccount] = useState<RentSummaryDto | null>(null);
  const [rentPaidTick, setRentPaidTick] = useState(0);
  const [loanClearGrn, setLoanClearGrn] = useState<Grn | null>(null);
  const [loanClearedTick, setLoanClearedTick] = useState(0);
  const [initialGrnId, setInitialGrnId] = useState<string | undefined>(undefined);

  React.useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const action = params.get('action');
      const grnId = params.get('grnId');
      if (action === 'create') {
        setIsCreateOpen(true);
      }
      if (grnId) {
        setInitialGrnId(grnId);
      }
    }
  }, []);

  const userRole = (user?.role ?? 'READ_ONLY') as Role;
  const canCreate = can(userRole, 'delivery:create');
  const canPrint = can(userRole, 'document:print');
  const canCollectRent = can(userRole, 'rent:collect');
  const canUpdateLoan = can(userRole, 'grn:create');
  const canReverse = can(userRole, 'delivery:reversal');

  const handleRentPaidFromDelivery = () => {
    setRentPayAccount(null);
    setRentPaidTick((t) => t + 1);
    void deliveryData.fetchDeliveries();
  };

  const handleLoanClearedFromDelivery = () => {
    setLoanClearGrn(null);
    setLoanClearedTick((t) => t + 1);
    void deliveryData.fetchDeliveries();
  };

  const handleCollectRent = async (delivery: DeliveryChallan) => {
    if (!selectedFacilityId) return;
    try {
      const res = await requestWithAuth(
        `/api/facilities/${encodeURIComponent(selectedFacilityId)}/rent/grn/${encodeURIComponent(delivery.grnId)}`,
      );
      if (!res.ok) {
        throw new Error('Failed to load rent details for this GRN');
      }
      const summary: RentSummaryDto = await res.json();
      setRentPayAccount(summary);
    } catch (err: unknown) {
      setPrintError(err instanceof Error ? err.message : 'Failed to load rent details');
    }
  };

  const handlePrintChallan = async (challanId: string) => {
    if (!selectedFacilityId) return;
    setPrintingId(challanId);
    setPrintError(null);
    try {
      await printHtmlDocument({
        url: `/api/facilities/${encodeURIComponent(selectedFacilityId)}/documents/challan/${encodeURIComponent(challanId)}`,
        popupBlockedMessage: PRINT_MESSAGES.popupBlocked,
        failureMessage: PRINT_MESSAGES.challanFailed,
      });
    } catch (err: unknown) {
      setPrintError(err instanceof Error ? err.message : PRINT_MESSAGES.challanFailed);
    } finally {
      setPrintingId(null);
    }
  };

  return (
    <div className={styles.page}>
      {printError && <Banner message={printError} />}

      <div className={styles.headerRow}>
        <div className={styles.titleArea}>
          <h1 className={styles.pageTitle}>Outward Deliveries</h1>
        </div>

        <div className={styles.headerActions}>
          {canCreate && selectedFacilityId && (
            <Button
              id="create-delivery-btn"
              variant="primary"
              onClick={() => setIsCreateOpen(true)}
              leftIcon={<Plus size={16} aria-hidden="true" />}
            >
              Issue Delivery Challan
            </Button>
          )}
        </div>
      </div>

      {!selectedFacilityId ? (
        <FeedbackStates.Empty message={EMPTY_MESSAGES.noFacilityDeliveries} />
      ) : (
        <>
          <FilterToolbar
            searchValue={deliveryData.searchTerm}
            onSearchChange={deliveryData.setSearchTerm}
            searchPlaceholder="Search Challan #, GRN #, Customer, Vehicle..."
            searchAriaLabel="Search deliveries"
            searchInputId="delivery-search-input"
            selects={[
              {
                id: 'delivery-status-filter',
                ariaLabel: 'Filter by Delivery Status',
                value: deliveryData.statusFilter,
                onChange: (v) => deliveryData.setStatusFilter(v as '' | DeliveryStatus),
                options: [
                  { value: '', label: 'All Statuses' },
                  { value: 'ISSUED', label: 'Issued (Active)' },
                  { value: 'REVERSED', label: 'Reversed' },
                ],
              },
            ]}
            onReset={deliveryData.resetFilters}
            hasActiveFilters={Boolean(deliveryData.statusFilter || deliveryData.searchTerm)}
          />

          {deliveryData.loading ? (
            <FeedbackStates.Loading label={LOADING_LABELS.deliveries} />
          ) : deliveryData.error ? (
            <FeedbackStates.Error
              title={ERROR_TITLES.deliveries}
              message={deliveryData.error}
              onRetry={() => void deliveryData.fetchDeliveries()}
            />
          ) : deliveryData.deliveries.length === 0 ? (
            <FeedbackStates.Empty
              message={emptyForFacility(deliveryData.currentFacilityName, 'deliveries')}
              action={
                canCreate
                  ? {
                      label: '+ Issue Delivery Challan',
                      onClick: () => setIsCreateOpen(true),
                      id: 'create-delivery-empty-btn',
                    }
                  : undefined
              }
            />
          ) : deliveryData.filteredDeliveries.length === 0 ? (
            <FeedbackStates.Empty
              message={`No delivery challans matching "${deliveryData.searchTerm}".`}
            />
          ) : (
            <DeliveryTable
              deliveries={deliveryData.filteredDeliveries}
              caption={`Delivery Challans for ${deliveryData.currentFacilityName}`}
              canPrint={canPrint}
              canCollectRent={canCollectRent}
              canReverse={canReverse}
              printingId={printingId}
              page={deliveryData.page}
              pageSize={deliveryData.pageSize}
              totalPages={deliveryData.totalPages}
              totalDeliveries={deliveryData.totalDeliveries}
              onPageChange={deliveryData.setPage}
              onSelectDelivery={setSelectedDelivery}
              onPrintChallan={handlePrintChallan}
              onCollectRent={handleCollectRent}
              onReverse={setReverseDelivery}
            />
          )}
        </>
      )}

      <DeliveryPageModals
        selectedFacilityId={selectedFacilityId}
        selectedDelivery={selectedDelivery}
        isCreateOpen={isCreateOpen}
        initialGrnId={initialGrnId}
        loanClearGrn={loanClearGrn}
        rentPayAccount={rentPayAccount}
        reverseDelivery={reverseDelivery}
        canPrint={canPrint}
        canCollectRent={canCollectRent}
        canUpdateLoan={canUpdateLoan}
        printingId={printingId}
        rentPaidTick={rentPaidTick}
        loanClearedTick={loanClearedTick}
        onCloseDetail={() => setSelectedDelivery(null)}
        onCloseCreate={() => setIsCreateOpen(false)}
        onCloseLoanClear={() => setLoanClearGrn(null)}
        onCreateSuccess={(newDelivery, summary) => {
          setIsCreateOpen(false);
          void deliveryData.fetchDeliveries();
          setSelectedDelivery(newDelivery);
          void summary;
        }}
        onPayRent={setRentPayAccount}
        onClearLoan={setLoanClearGrn}
        onLoanCleared={handleLoanClearedFromDelivery}
        onCloseRentPay={() => setRentPayAccount(null)}
        onRentPaid={handleRentPaidFromDelivery}
        onCloseReverse={() => setReverseDelivery(null)}
        onReversed={() => {
          setReverseDelivery(null);
          void deliveryData.fetchDeliveries();
        }}
        onPrintChallan={handlePrintChallan}
      />
    </div>
  );
}
