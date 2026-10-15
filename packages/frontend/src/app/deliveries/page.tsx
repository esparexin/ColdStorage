'use client';

import React, { useEffect, useState } from 'react';
import { type DeliveryChallan, type Grn, type RentSummaryDto } from '@cold-storage/contracts';
import { FeedbackStates } from '@/components/ui/FeedbackStates';
import { Banner } from '@/components/ui/Banner';
import { EMPTY_MESSAGES, ERROR_TITLES, LOADING_LABELS, PRINT_MESSAGES, emptyForFacility } from '@/components/ui/stateCopy';
import { usePermissions } from '@/hooks/usePermissions';
import { useFacility } from '@/context/FacilityContext';
import { printHtmlDocument } from '@/lib/print-document';
import { requestWithAuth } from '@/lib/api-client';
import { DeliveryFilterToolbar } from './components/DeliveryFilterToolbar';
import { DeliveryPageModals } from './components/DeliveryPageModals';
import { DeliveryStatusTabs } from './components/DeliveryStatusTabs';
import { DeliveryTable } from './components/DeliveryTable';
import { IssueDeliveryChallanPanel } from './components/IssueDeliveryChallanPanel';
import type { DeliveryViewTab } from './hooks/deliveryTabPersistence.helper';
import { useDeliveries } from './hooks/useDeliveries';
import styles from './page.module.css';

export default function DeliveriesPage() {
  const { hasPermission } = usePermissions();
  const { selectedFacilityId, availableFacilities } = useFacility();
  const deliveryData = useDeliveries(selectedFacilityId, availableFacilities);

  const [activeView, setActiveView] = useState<DeliveryViewTab>('listing');
  const [selectedDelivery, setSelectedDelivery] = useState<DeliveryChallan | null>(null);
  const [printingId, setPrintingId] = useState<string | null>(null);
  const [printError, setPrintError] = useState<string | null>(null);
  const [rentPayAccount, setRentPayAccount] = useState<RentSummaryDto | null>(null);
  const [rentPaidTick, setRentPaidTick] = useState(0);
  const [loanClearGrn, setLoanClearGrn] = useState<Grn | null>(null);
  const [loanClearedTick, setLoanClearedTick] = useState(0);
  const [initialGrnId, setInitialGrnId] = useState<string | undefined>(undefined);
  const [rentPromptDelivery, setRentPromptDelivery] = useState<DeliveryChallan | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    if (params.get('action') === 'create' || params.get('tab')?.toLowerCase() === 'issue') setActiveView('issue');
    const grnId = params.get('grnId');
    if (grnId && /^[A-Za-z0-9_-]{1,128}$/.test(grnId)) setInitialGrnId(grnId);
    const url = new URL(window.location.href);
    ['grnId', 'action'].forEach((k) => url.searchParams.delete(k));
    window.history.replaceState({}, '', url.toString());
  }, []);
  const canCreate = hasPermission('delivery:create');
  const canPrint = hasPermission('document:print');
  const canCollectRent = hasPermission('rent:collect');
  const canUpdateLoan = hasPermission('grn:create');

  const syncTabUrl = (tab: string) => {
    if (typeof window === 'undefined') return;
    const url = new URL(window.location.href);
    url.searchParams.set('tab', tab);
    window.history.replaceState({}, '', url.toString());
  };

  const handleViewChange = (view: DeliveryViewTab) => {
    setActiveView(view);
    const tabMap: Record<string, string> = { CLOSED: 'closed', DUE: 'due', '': 'all' };
    syncTabUrl(view === 'issue' ? 'issue' : tabMap[deliveryData.statusTab] ?? 'active');
  };

  const handleSelectTab = (tab: '' | 'ACTIVE' | 'DUE' | 'CLOSED' | 'ISSUE') => {
    if (tab === 'ISSUE') {
      handleViewChange('issue');
    } else {
      setActiveView('listing');
      deliveryData.setStatusTab(tab);
      const tabMap: Record<string, string> = { CLOSED: 'closed', DUE: 'due', '': 'all' };
      syncTabUrl(tabMap[tab] ?? 'active');
    }
  };

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
      const res = await requestWithAuth(`/api/facilities/${encodeURIComponent(selectedFacilityId)}/rent/grn/${encodeURIComponent(delivery.grnId)}`);
      if (!res.ok) throw new Error('Failed to load rent details for this GRN');
      setRentPayAccount(await res.json());
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

  const getFilteredEmptyMessage = () => {
    if (deliveryData.searchTerm) return `No delivery challans matching "${deliveryData.searchTerm}".`;
    const tabMsg: Record<string, string> = {
      CLOSED: 'No closed delivery challans found for this facility.',
      DUE: 'No delivery challans with due payments found for this facility.',
      ACTIVE: 'No active delivery challans found for this facility.',
    };
    return tabMsg[deliveryData.statusTab] ?? 'No delivery challans found.';
  };

  return (
    <div className={styles.page}>
      {printError && <Banner message={printError} />}

      <div className={styles.headerRow}>
        <div className={styles.titleArea}>
          <h1 className={styles.pageTitle}>Outward Deliveries</h1>
        </div>
      </div>

      {!selectedFacilityId ? (
        <FeedbackStates.Empty message={EMPTY_MESSAGES.noFacilityDeliveries} />
      ) : (
        <>
          <DeliveryStatusTabs
            activeView={activeView}
            currentTab={deliveryData.statusTab}
            onSelectTab={handleSelectTab}
            canCreate={canCreate}
          />
          {activeView === 'issue' ? (
            <IssueDeliveryChallanPanel
              facilityId={selectedFacilityId}
              initialGrnId={initialGrnId}
              onCancel={() => handleViewChange('listing')}
              onSuccess={(newDelivery) => {
                handleViewChange('listing');
                void deliveryData.fetchDeliveries();
                if (newDelivery.rentCharge && newDelivery.rentCharge > 0 && canCollectRent) {
                  setRentPromptDelivery(newDelivery);
                } else {
                  setSelectedDelivery(newDelivery);
                }
              }}
              onPayRent={setRentPayAccount}
              rentPaidTick={rentPaidTick}
              canPayRent={canCollectRent}
              onClearLoan={setLoanClearGrn}
              loanClearedTick={loanClearedTick}
              canClearLoan={canUpdateLoan}
            />
          ) : (
            <>
              <DeliveryFilterToolbar
            searchTerm={deliveryData.searchTerm}
            onSearchChange={deliveryData.setSearchTerm}
            rentStatusFilter={deliveryData.rentStatusFilter}
            onRentStatusChange={deliveryData.setRentStatusFilter}
            onReset={deliveryData.resetFilters}
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
              action={canCreate ? { label: '+ Issue Delivery Challan', onClick: () => handleViewChange('issue'), id: 'create-delivery-empty-btn' } : undefined}
            />
          ) : deliveryData.filteredDeliveries.length === 0 ? (
            <FeedbackStates.Empty
              message={getFilteredEmptyMessage()}
              action={{
                label: 'Clear Filters',
                onClick: deliveryData.resetFilters,
                id: 'clear-delivery-filters-btn',
              }}
            />
          ) : (
            <DeliveryTable
              deliveries={deliveryData.filteredDeliveries}
              caption={`Delivery Challans for ${deliveryData.currentFacilityName}`}
              canPrint={canPrint}
              canCollectRent={canCollectRent}
              printingId={printingId}
              page={deliveryData.page}
              pageSize={deliveryData.pageSize}
              totalPages={deliveryData.totalPages}
              totalDeliveries={deliveryData.totalDeliveries}
              onPageChange={deliveryData.setPage}
              onSelectDelivery={setSelectedDelivery}
              onPrintChallan={handlePrintChallan}
              onCollectRent={handleCollectRent}
            />
          )}
        </>
      )}
    </>
  )}

      <DeliveryPageModals
        selectedFacilityId={selectedFacilityId}
        selectedDelivery={selectedDelivery}
        loanClearGrn={loanClearGrn}
        rentPayAccount={rentPayAccount}
        canPrint={canPrint}
        printingId={printingId}
        onCloseDetail={() => setSelectedDelivery(null)}
        onCloseLoanClear={() => setLoanClearGrn(null)}
        onLoanCleared={handleLoanClearedFromDelivery}
        onCloseRentPay={() => setRentPayAccount(null)}
        onRentPaid={handleRentPaidFromDelivery}
        onPrintChallan={handlePrintChallan}
        rentPromptDelivery={rentPromptDelivery}
        onConfirmRentPrompt={(del) => {
          setRentPromptDelivery(null);
          void handleCollectRent(del);
        }}
        onCancelRentPrompt={() => {
          const del = rentPromptDelivery;
          setRentPromptDelivery(null);
          if (del) setSelectedDelivery(del);
        }}
      />
    </div>
  );
}
