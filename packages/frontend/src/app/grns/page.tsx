'use client';

import React, { useState } from 'react';
import { Plus } from 'lucide-react';
import { can, type Grn, type Role } from '@cold-storage/contracts';
import { FeedbackStates } from '@/components/ui/FeedbackStates';
import { useAuth } from '@/context/AuthContext';
import { useFacility } from '@/context/FacilityContext';
import { requestWithAuth } from '@/lib/api-client';
import { CreateGrnModal } from './components/CreateGrnModal';
import { GrnDetailModal } from './components/GrnDetailModal';
import { GrnFilterToolbar } from './components/GrnFilterToolbar';
import { GrnTable } from './components/GrnTable';
import { useGrns } from './hooks/useGrns';
import styles from './page.module.css';

export default function GrnsPage() {
  const { user } = useAuth();
  const { selectedFacilityId, availableFacilities } = useFacility();
  const grnData = useGrns(selectedFacilityId, availableFacilities);

  const [selectedGrn, setSelectedGrn] = useState<Grn | null>(null);
  const [printingId, setPrintingId] = useState<string | null>(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  const userRole = (user?.role ?? 'READ_ONLY') as Role;
  const canCreate = can(userRole, 'grn:create');
  const canPrint = can(userRole, 'document:print');
  const canAllocate = can(userRole, 'rack:allocate');

  const handlePrint = async (type: 'grn' | 'receipt', grnId: string) => {
    if (!selectedFacilityId) return;
    setPrintingId(`${type}-${grnId}`);
    try {
      const url = `/api/facilities/${encodeURIComponent(selectedFacilityId)}/documents/${type}/${encodeURIComponent(grnId)}`;
      const res = await requestWithAuth(url);
      if (!res.ok) {
        const err = (await res.json()) as { error?: string; message?: string };
        throw new Error(err.error ?? err.message ?? `Print failed (HTTP ${res.status})`);
      }
      const html = await res.text();
      const printWindow = window.open('', '_blank');
      if (!printWindow) {
        alert('Pop-up window was blocked. Please allow pop-ups for this site to print documents.');
        return;
      }
      printWindow.document.open();
      printWindow.document.write(html);
      printWindow.document.close();
      printWindow.focus();
      setTimeout(() => printWindow.print(), 300);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to generate document');
    } finally {
      setPrintingId(null);
    }
  };

  return (
    <div className={styles.page}>
      <div className={styles.headerRow}>
        <div className={styles.titleArea}>
          <h1 className={styles.pageTitle}>Goods Receipt Notes (GRN)</h1>
          <p className={styles.pageSub}>
            Inward stock recording, weight accounting, storage allocation & official documentation.
          </p>
        </div>

        <div className={styles.headerActions}>
          {canCreate && selectedFacilityId && (
            <button
              id="create-grn-header-btn"
              type="button"
              className={styles.primaryBtn}
              onClick={() => setIsCreateOpen(true)}
            >
              <Plus size={16} aria-hidden="true" />
              Create Inward GRN
            </button>
          )}
        </div>
      </div>

      {!selectedFacilityId ? (
        <FeedbackStates.Empty
          message="Please select a facility from the top header to manage Goods Receipt Notes."
        />
      ) : (
        <>
          <GrnFilterToolbar
            searchTerm={grnData.searchTerm}
            onSearchChange={grnData.setSearchTerm}
            statusFilter={grnData.statusFilter}
            onStatusChange={grnData.setStatusFilter}
            customerFilter={grnData.customerFilter}
            onCustomerChange={grnData.setCustomerFilter}
            commodityFilter={grnData.commodityFilter}
            onCommodityChange={grnData.setCommodityFilter}
            customers={grnData.customers}
            commodities={grnData.commodities}
            onReset={grnData.resetFilters}
          />

          {grnData.loading ? (
            <FeedbackStates.Loading label="Loading Goods Receipt Notes..." />
          ) : grnData.error ? (
            <FeedbackStates.Error
              title="Error loading GRNs"
              message={grnData.error}
              onRetry={() => void grnData.fetchGrns()}
            />
          ) : grnData.grns.length === 0 ? (
            <FeedbackStates.Empty
              message={`No Goods Receipt Notes recorded for ${grnData.currentFacilityName} yet.`}
              action={
                canCreate
                  ? {
                      label: '+ Create Inward GRN',
                      onClick: () => setIsCreateOpen(true),
                      id: 'create-grn-empty-btn',
                    }
                  : undefined
              }
            />
          ) : (
            <GrnTable
              grns={grnData.filteredGrns}
              caption={`Goods Receipt Notes for ${grnData.currentFacilityName}`}
              canPrint={canPrint}
              canAllocate={canAllocate}
              printingId={printingId}
              onSelectGrn={setSelectedGrn}
              onPrint={handlePrint}
            />
          )}
        </>
      )}

      {selectedGrn && (
        <GrnDetailModal
          grn={selectedGrn}
          onClose={() => setSelectedGrn(null)}
          canPrint={canPrint}
          canAllocate={canAllocate}
          printingId={printingId}
          onPrint={handlePrint}
        />
      )}

      {isCreateOpen && selectedFacilityId && (
        <CreateGrnModal
          facilityId={selectedFacilityId}
          customers={grnData.customers}
          commodities={grnData.commodities}
          chambers={grnData.chambers}
          onClose={() => setIsCreateOpen(false)}
          onCustomerAdded={() => void grnData.fetchLookups()}
          onSuccess={(newGrn) => {
            setIsCreateOpen(false);
            void grnData.fetchGrns();
            setSelectedGrn(newGrn);
          }}
        />
      )}
    </div>
  );
}
