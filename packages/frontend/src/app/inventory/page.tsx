'use client';

import React, { Suspense, useMemo, useState } from 'react';
import { FeedbackStates } from '@/components/ui/FeedbackStates';
import { useFacility } from '@/context/FacilityContext';
import { InventoryHeader } from './components/InventoryHeader';
import { ChamberStockTab } from './components/ChamberStockTab';
import { LedgerTab } from './components/LedgerTab';
import { useInventoryData } from './hooks/useInventoryData';
import { useStockLedger } from './hooks/useStockLedger';
import styles from './page.module.css';

function InventoryContent() {
  const { selectedFacilityId, availableFacilities } = useFacility();
  const [activeTab, setActiveTab] = useState<'chambers' | 'ledger'>('chambers');

  const inventoryData = useInventoryData(selectedFacilityId);
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
        activeTab={activeTab}
        onTabChange={setActiveTab}
      />

      {activeTab === 'chambers' && (
        <ChamberStockTab
          stockSummary={inventoryData.stockSummary}
          loadingSummary={inventoryData.loadingSummary}
          currentFacilityName={currentFacilityName}
        />
      )}

      {activeTab === 'ledger' && (
        <LedgerTab
          ledger={ledger}
          currentFacilityName={currentFacilityName}
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
