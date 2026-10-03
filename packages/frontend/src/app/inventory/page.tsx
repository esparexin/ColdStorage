'use client';

import React, { Suspense, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { can, type Role } from '@cold-storage/contracts';
import { FeedbackStates } from '@/components/ui/FeedbackStates';
import { useAuth } from '@/context/AuthContext';
import { useFacility } from '@/context/FacilityContext';
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

  const [activeTab, setActiveTab] = useState<'put-away' | 'hierarchy' | 'ledger'>(() =>
    initialGrnId ? 'put-away' : 'put-away',
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
