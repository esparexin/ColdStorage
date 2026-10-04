'use client';

import React, { Suspense, useMemo } from 'react';
import { FeedbackStates } from '@/components/ui/FeedbackStates';
import { useFacility } from '@/context/FacilityContext';
import { InventoryHeader } from './components/InventoryHeader';
import { ChamberStockTab } from './components/ChamberStockTab';
import { useInventoryData } from './hooks/useInventoryData';
import styles from './page.module.css';

function InventoryContent() {
  const { selectedFacilityId, availableFacilities } = useFacility();
  const inventoryData = useInventoryData(selectedFacilityId);

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
        stockSummary={inventoryData.stockSummary}
        loadingSummary={inventoryData.loadingSummary}
      />

      <ChamberStockTab
        stockSummary={inventoryData.stockSummary}
        loadingSummary={inventoryData.loadingSummary}
        currentFacilityName={currentFacilityName}
      />
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
