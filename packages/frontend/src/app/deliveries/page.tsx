'use client';

import React, { useState } from 'react';
import { Plus } from 'lucide-react';
import { can, type DeliveryChallan, type Role, type RentSummaryDto } from '@cold-storage/contracts';
import { FeedbackStates } from '@/components/ui/FeedbackStates';
import { Button } from '@/components/ui';
import { useAuth } from '@/context/AuthContext';
import { useFacility } from '@/context/FacilityContext';
import { requestWithAuth } from '@/lib/api-client';
import { CollectPaymentModal } from '../rent/components/CollectPaymentModal';
import { CreateDeliveryModal } from './components/CreateDeliveryModal';
import { DeliveryDetailModal } from './components/DeliveryDetailModal';
import { DeliveryFilterToolbar } from './components/DeliveryFilterToolbar';
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
    try {
      const url = `/api/facilities/${encodeURIComponent(selectedFacilityId)}/documents/challan/${encodeURIComponent(challanId)}`;
      const res = await requestWithAuth(url);
      if (!res.ok) {
        const err = (await res.json()) as { error?: string; message?: string };
        throw new Error(err.error ?? err.message ?? `Print failed (HTTP ${res.status})`);
      }
      const html = await res.text();
      const printWindow = window.open('', '_blank');
      if (!printWindow) {
        alert('Pop-up window was blocked. Please allow pop-ups for this site to print delivery challans.');
        return;
      }
      printWindow.document.open();
      printWindow.document.write(html);
      printWindow.document.close();
      printWindow.focus();
      setTimeout(() => printWindow.print(), 300);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to generate delivery challan');
    } finally {
      setPrintingId(null);
    }
  };

  return (
    <div className={styles.page}>
      <div className={styles.headerRow}>
        <div className={styles.titleArea}>
          <h1 className={styles.pageTitle}>Outward Deliveries</h1>
          <p className={styles.pageSub}>
            Delivery Challan issuance, position-level bag withdrawals, and gate pass management for{' '}
            {deliveryData.currentFacilityName}.
          </p>
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
          <DeliveryFilterToolbar
            searchTerm={deliveryData.searchTerm}
            onSearchChange={deliveryData.setSearchTerm}
            statusFilter={deliveryData.statusFilter}
            onStatusChange={deliveryData.setStatusFilter}
            onReset={deliveryData.resetFilters}
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
