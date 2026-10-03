'use client';

import React, { Suspense, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { can, type RentSummaryDto, type Role } from '@cold-storage/contracts';
import { FeedbackStates } from '@/components/ui/FeedbackStates';
import { useAuth } from '@/context/AuthContext';
import { useFacility } from '@/context/FacilityContext';
import { CollectPaymentModal } from '../rent/components/CollectPaymentModal';
import { useRentGate } from '@/hooks/useRentGate';
import { HierarchyTab } from './components/HierarchyTab';
import { InventoryHeader } from './components/InventoryHeader';
import { LedgerTab } from './components/LedgerTab';
import { OccupancyInspectorModal } from './components/OccupancyInspectorModal';
import { PutAwayTab } from './components/PutAwayTab';
import { useInventoryData } from './hooks/useInventoryData';
import { usePutAway } from './hooks/usePutAway';
import { useStockLedger } from './hooks/useStockLedger';
import { useStorageHierarchy } from './hooks/useStorageHierarchy';
import styles from './page.module.css';

function InventoryContent() {
  const { user } = useAuth();
  const { selectedFacilityId, availableFacilities } = useFacility();
  const searchParams = useSearchParams();
  const initialGrnId = searchParams.get('grnId');

  const userRole = (user?.role ?? 'READ_ONLY') as Role;
  const canAllocate = can(userRole, 'rack:allocate');
  const canManageStorage = can(userRole, 'storage:manage');
  const canCollectRent = can(userRole, 'rent:collect');
  const canPrintRent = can(userRole, 'rent:print');
  const [rentPayAccount, setRentPayAccount] = useState<RentSummaryDto | null>(null);
  const rentGate = useRentGate();

const [activeTab, setActiveTab] = useState<'put-away' | 'hierarchy' | 'ledger'>(
    'put-away',
  );

  const inventoryData = useInventoryData(selectedFacilityId);
  const putAway = usePutAway(selectedFacilityId, initialGrnId, () => {
    void inventoryData.fetchStockSummary();
  });
  const hierarchy = useStorageHierarchy(selectedFacilityId);
  const ledger = useStockLedger(selectedFacilityId);

  const currentFacilityName = useMemo(() => {
    return (
      availableFacilities.find((f) => f.id === selectedFacilityId)?.name ??
      selectedFacilityId ??
      ''
    );
  }, [availableFacilities, selectedFacilityId]);

  const handlePayRentForBlockedGrn = async () => {
    if (!selectedFacilityId || !putAway.rentBlocked) return;
    const summary = await rentGate.refreshRentGate(selectedFacilityId, putAway.rentBlocked.grnId);
    if (summary) {
      setRentPayAccount(summary);
    }
  };

  const handleRentPaidFromPutAway = () => {
    setRentPayAccount(null);
    rentGate.resetRentGate();
    putAway.clearRentBlock();
    if (putAway.selectedGrnId) {
      void putAway.fetchGrnSummaryAndHistory(putAway.selectedGrnId);
    }
  };

  if (!selectedFacilityId) {
    return (
      <div className={styles.page}>
        <FeedbackStates.Empty message="Please select a facility from the top header to manage inventory." />
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <InventoryHeader
        currentFacilityName={currentFacilityName}
        stockSummary={inventoryData.stockSummary}
        loadingSummary={inventoryData.loadingSummary}
        chambers={hierarchy.chambers}
        openGrns={inventoryData.openGrns}
        activeTab={activeTab}
        onTabChange={setActiveTab}
      />

      {activeTab === 'put-away' && (
        <PutAwayTab
          openGrns={inventoryData.openGrns}
          putAway={putAway}
          canAllocate={canAllocate}
          canPayRent={canCollectRent}
          payLoading={rentGate.rentLoading}
          onPayRent={() => void handlePayRentForBlockedGrn()}
        />
      )}

      {activeTab === 'hierarchy' && (
        <HierarchyTab
          hierarchy={hierarchy}
          canManageStorage={canManageStorage}
        />
      )}

      {activeTab === 'ledger' && (
        <LedgerTab
          ledger={ledger}
          currentFacilityName={currentFacilityName}
        />
      )}

      {hierarchy.selectedOccupancy && (
        <OccupancyInspectorModal
          occupancy={hierarchy.selectedOccupancy}
          onClose={() => hierarchy.setSelectedOccupancy(null)}
        />
      )}

      {rentPayAccount && selectedFacilityId && (
        <CollectPaymentModal
          account={rentPayAccount}
          selectedFacilityId={selectedFacilityId}
          canPrint={canPrintRent}
          onClose={() => setRentPayAccount(null)}
          onPaymentSuccess={handleRentPaidFromPutAway}
        />
      )}
    </div>
  );
}

export default function InventoryPage() {
  return (
    <Suspense fallback={<FeedbackStates.Loading label="Loading inventory module..." />}>
      <InventoryContent />
    </Suspense>
  );
}
