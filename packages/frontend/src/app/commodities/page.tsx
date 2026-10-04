'use client';

import React, { useState } from 'react';
import { Plus } from 'lucide-react';
import { can, type Role } from '@cold-storage/contracts';
import { Button, FeedbackStates, SearchBar } from '@/components/ui';
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
        <FeedbackStates.Loading label="Loading commodities…" />
      ) : error ? (
        <FeedbackStates.Error message={error} onRetry={() => void fetchCommodities()} />
      ) : commodities.length === 0 ? (
        <FeedbackStates.Empty
          message="No commodities registered yet."
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
      ) : filteredCommodities.length === 0 ? (
        <FeedbackStates.Empty message={`No commodities matching "${searchTerm}".`} />
      ) : (
        <CommodityTable
          commodities={filteredCommodities}
          canManage={canManage}
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
