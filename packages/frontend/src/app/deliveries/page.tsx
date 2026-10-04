'use client';

import React, { useState } from 'react';
import { Plus } from 'lucide-react';
import { can, type DeliveryChallan, type DeliveryStatus,
  type Role, type RentSummaryDto } from '@cold-storage/contracts';
import { FeedbackStates } from '@/components/ui/FeedbackStates';
import { Button, FilterToolbar } from '@/components/ui';
import { useAuth } from '@/context/AuthContext';
import { useFacility } from '@/context/FacilityContext';
import { printHtmlDocument } from '@/lib/print-document';
import { CollectPaymentModal } from '../rent/components/CollectPaymentModal';
import { CreateDeliveryModal } from './components/CreateDeliveryModal';
import { DeliveryDetailModal } from './components/DeliveryDetailModal';
import { DeliveryReversalModal } from './components/DeliveryReversalModal';
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
  const [reversingDelivery, setReversingDelivery] = useState<DeliveryChallan | null>(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [rentPayAccount, setRentPayAccount] = useState<RentSummaryDto | null>(null);
  const [rentPaidTick, setRentPaidTick] = useState(0);

  const userRole = (user?.role ?? 'READ_ONLY') as Role;
  const canCreate = can(userRole, 'delivery:create');
  const canPrint = can(userRole, 'document:print');
  const canReverse = can(userRole, 'delivery:reversal');
  const canCollectRent = can(userRole, 'rent:collect');

  const handleRentPaidFromDelivery = () => {
    setRentPayAccount(null);
    setRentPaidTick((t) => t + 1);
  };

  const handlePrintChallan = async (challanId: string) => {
    if (!selectedFacilityId) return;
    setPrintingId(challanId);
    setPrintError(null);
    try {
      await printHtmlDocument({
        url: `/api/facilities/${encodeURIComponent(selectedFacilityId)}/documents/challan/${encodeURIComponent(challanId)}`,
        popupBlockedMessage:
          'Pop-up window was blocked. Please allow pop-ups for this site to print delivery challans.',
        failureMessage: 'Failed to generate delivery challan',
      });
    } catch (err: unknown) {
      setPrintError(err instanceof Error ? err.message : 'Failed to generate delivery challan');
    } finally {
      setPrintingId(null);
    }
  };

  return (
    <div className={styles.page}>
      {printError && (
        <div className={`${styles.banner} ${styles.bannerError}`} role="alert">
          <span>{printError}</span>
        </div>
      )}

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
        <FeedbackStates.Empty message="Please select a facility from the top header to manage deliveries." />
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
            <FeedbackStates.Loading label="Loading Delivery Challans..." />
          ) : deliveryData.error ? (
            <FeedbackStates.Error
              title="Error loading deliveries"
              message={deliveryData.error}
              onRetry={() => void deliveryData.fetchDeliveries()}
            />
          ) : deliveryData.deliveries.length === 0 ? (
            <FeedbackStates.Empty
              message={`No delivery challans recorded for ${deliveryData.currentFacilityName} yet.`}
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
          ) : (
            <DeliveryTable
              deliveries={deliveryData.filteredDeliveries}
              caption={`Delivery Challans for ${deliveryData.currentFacilityName}`}
              canPrint={canPrint}
              canReverse={canReverse}
              printingId={printingId}
              page={deliveryData.page}
              pageSize={deliveryData.pageSize}
              totalPages={deliveryData.totalPages}
              totalDeliveries={deliveryData.totalDeliveries}
              onPageChange={deliveryData.setPage}
              onSelectDelivery={setSelectedDelivery}
              onPrintChallan={handlePrintChallan}
              onStartReversal={setReversingDelivery}
            />
          )}
        </>
      )}

      {selectedDelivery && (
        <DeliveryDetailModal
          delivery={selectedDelivery}
          onClose={() => setSelectedDelivery(null)}
          canPrint={canPrint}
          printingId={printingId}
          onPrintChallan={handlePrintChallan}
        />
      )}

      {isCreateOpen && selectedFacilityId && (
        <CreateDeliveryModal
          facilityId={selectedFacilityId}
          onClose={() => setIsCreateOpen(false)}
          onSuccess={(newDelivery, summary) => {
            setIsCreateOpen(false);
            void deliveryData.fetchDeliveries();
            setSelectedDelivery(newDelivery);
            void summary;
          }}
          onPayRent={setRentPayAccount}
          rentPaidTick={rentPaidTick}
          canPayRent={canCollectRent}
        />
      )}

      {rentPayAccount && selectedFacilityId && (
        <CollectPaymentModal
          account={rentPayAccount}
          selectedFacilityId={selectedFacilityId}
          canPrint={canPrint}
          onClose={() => setRentPayAccount(null)}
          onPaymentSuccess={handleRentPaidFromDelivery}
        />
      )}

      {reversingDelivery && selectedFacilityId && (
        <DeliveryReversalModal
          facilityId={selectedFacilityId}
          delivery={reversingDelivery}
          onClose={() => setReversingDelivery(null)}
          onSuccess={() => {
            setReversingDelivery(null);
            void deliveryData.fetchDeliveries();
          }}
        />
      )}
    </div>
  );
}
