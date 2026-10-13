'use client';

import React, { useState } from 'react';
import { Plus } from 'lucide-react';
import { type Commodity } from '@cold-storage/contracts';
import { Button, ConfirmDialog, FeedbackStates, FilterToolbar } from '@/components/ui';
import {
  EMPTY_MESSAGES,
  ERROR_TITLES,
  LOADING_LABELS,
  noMatchMessage,
} from '@/components/ui/stateCopy';
import { usePermissions } from '@/hooks/usePermissions';
import { CommodityFormModal } from './components/CommodityFormModal';
import { CommodityRatesModal } from './components/CommodityRatesModal';
import { CommodityTable } from './components/CommodityTable';
import { useCommodities } from './hooks/useCommodities';
import styles from './page.module.css';

export default function CommoditiesPage() {
  const { hasPermission } = usePermissions();
  const {
    commodities,
    ratesMap,
    ratesLoading,
    loading,
    error,
    searchTerm,
    setSearchTerm,
    filteredCommodities,
    totalCommodities,
    totalPages,
    page,
    setPage,
    pageSize,
    fetchCommodities,
    handleToggleActive,
  } = useCommodities();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCommodity, setEditingCommodity] = useState<Commodity | null>(null);
  const [ratesCommodity, setRatesCommodity] = useState<Commodity | null>(null);
  const [deactivatingCommodity, setDeactivatingCommodity] = useState<Commodity | null>(null);
  const [isDeactivating, setIsDeactivating] = useState(false);
  const canManage = hasPermission('commodity:manage');

  const openCreateModal = () => {
    setEditingCommodity(null);
    setIsModalOpen(true);
  };

  const openEditModal = (commodity: Commodity) => {
    setEditingCommodity(commodity);
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingCommodity(null);
  };

  return (
    <div className={styles.page}>
      <div className={styles.headerRow}>
        <div>
          <h1 className={styles.pageTitle}>Commodities</h1>
        </div>
        {canManage && (
          <Button
            id="add-commodity-btn"
            variant="primary"
            onClick={openCreateModal}
            leftIcon={<Plus size={16} aria-hidden="true" />}
          >
            Add Commodity
          </Button>
        )}
      </div>

      <FilterToolbar
        searchValue={searchTerm}
        onSearchChange={setSearchTerm}
        searchPlaceholder="Search by commodity name…"
        searchAriaLabel="Search commodities"
        onReset={() => setSearchTerm('')}
        hasActiveFilters={Boolean(searchTerm)}
      />

      {loading ? (
        <FeedbackStates.Loading label={LOADING_LABELS.commodities} />
      ) : error ? (
        <FeedbackStates.Error
          title={ERROR_TITLES.commodities}
          message={error}
          onRetry={() => void fetchCommodities()}
        />
      ) : filteredCommodities.length === 0 ? (
        searchTerm ? (
          <FeedbackStates.Empty message={noMatchMessage('commodities', searchTerm)} />
        ) : (
          <FeedbackStates.Empty
            message={EMPTY_MESSAGES.commoditiesEmpty}
            action={
              canManage
                ? {
                    id: 'empty-add-commodity-btn',
                    label: '+ Add Commodity',
                    onClick: openCreateModal,
                  }
                : undefined
            }
          />
        )
      ) : (
        <CommodityTable
          commodities={commodities}
          ratesMap={ratesMap}
          ratesLoading={ratesLoading}
          canManage={canManage}
          page={page}
          pageSize={pageSize}
          totalPages={totalPages}
          totalCommodities={totalCommodities}
          onPageChange={setPage}
          onToggleActive={handleToggleActive}
          onRequestDeactivate={setDeactivatingCommodity}
          onManageRates={setRatesCommodity}
          onEdit={openEditModal}
        />
      )}

      {isModalOpen && (
        <CommodityFormModal
          commodity={editingCommodity}
          onClose={closeModal}
          onSuccess={() => {
            closeModal();
            void fetchCommodities();
          }}
        />
      )}

      {ratesCommodity && (
        <CommodityRatesModal
          commodity={ratesCommodity}
          onClose={() => setRatesCommodity(null)}
          onSaved={() => {
            setRatesCommodity(null);
            void fetchCommodities();
          }}
        />
      )}

      <ConfirmDialog
        isOpen={Boolean(deactivatingCommodity)}
        title="Deactivate Commodity"
        confirmLabel="Deactivate"
        cancelLabel="Cancel"
        isBusy={isDeactivating}
        onCancel={() => setDeactivatingCommodity(null)}
        onConfirm={async () => {
          if (!deactivatingCommodity) return;
          setIsDeactivating(true);
          try {
            await handleToggleActive(deactivatingCommodity);
          } finally {
            setIsDeactivating(false);
            setDeactivatingCommodity(null);
          }
        }}
        message={
          <>
            Are you sure you want to deactivate <strong>{deactivatingCommodity?.name}</strong>?
            Existing inward receipts, stock ledger records, and rent billing history will be
            safely preserved, but this commodity cannot be selected for new inward receipts. You can
            reactivate it at any time.
          </>
        }
      />
    </div>
  );
}
