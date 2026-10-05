'use client';

import React, { useState } from 'react';
import { Plus } from 'lucide-react';
import { can, type Role } from '@cold-storage/contracts';
import { Button, FeedbackStates, SearchBar } from '@/components/ui';
import {
  EMPTY_MESSAGES,
  ERROR_TITLES,
  LOADING_LABELS,
  noMatchMessage,
} from '@/components/ui/stateCopy';
import { useAuth } from '@/context/AuthContext';
import { CommodityFormModal } from './components/CommodityFormModal';
import { CommodityTable } from './components/CommodityTable';
import { useCommodities } from './hooks/useCommodities';
import styles from './page.module.css';

export default function CommoditiesPage() {
  const { user } = useAuth();
  const {
    commodities,
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

  const userRole = (user?.role ?? 'READ_ONLY') as Role;
  const canManage = can(userRole, 'commodity:manage');

  const openCreateModal = () => {
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
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

      <SearchBar
        value={searchTerm}
        onChange={setSearchTerm}
        placeholder="Search by commodity name…"
        ariaLabel="Search commodities"
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
          canManage={canManage}
          page={page}
          pageSize={pageSize}
          totalPages={totalPages}
          totalCommodities={totalCommodities}
          onPageChange={setPage}
          onToggleActive={handleToggleActive}
        />
      )}

      {isModalOpen && (
        <CommodityFormModal
          onClose={closeModal}
          onSuccess={() => {
            closeModal();
            void fetchCommodities();
          }}
        />
      )}
    </div>
  );
}
