'use client';

import React from 'react';
import { Filter, Search } from 'lucide-react';
import type { DeliveryStatus } from '@cold-storage/contracts';
import styles from '../page.module.css';

interface DeliveryFilterToolbarProps {
  searchTerm: string;
  onSearchChange: (value: string) => void;
  statusFilter: '' | DeliveryStatus;
  onStatusChange: (status: '' | DeliveryStatus) => void;
  onReset: () => void;
}

export function DeliveryFilterToolbar({
  searchTerm,
  onSearchChange,
  statusFilter,
  onStatusChange,
  onReset,
}: DeliveryFilterToolbarProps) {
  const hasActiveFilters = Boolean(statusFilter || searchTerm);

  return (
    <div className={styles.toolbar}>
      <div className={styles.searchGroup}>
        <Search size={16} color="var(--color-text-muted)" aria-hidden="true" />
        <input
          id="delivery-search-input"
          type="text"
          placeholder="Search Challan #, GRN #, Customer, Vehicle..."
          value={searchTerm}
          onChange={(e) => onSearchChange(e.target.value)}
          className={styles.searchInput}
        />
      </div>

      <div className={styles.filtersGroup}>
        <select
          id="delivery-status-filter"
          aria-label="Filter by Delivery Status"
          className={styles.filterSelect}
          value={statusFilter}
          onChange={(e) => onStatusChange(e.target.value as '' | DeliveryStatus)}
        >
          <option value="">All Statuses</option>
          <option value="ISSUED">Issued (Active)</option>
          <option value="REVERSED">Reversed</option>
        </select>

        {hasActiveFilters && (
          <button
            type="button"
            className={styles.clearFiltersBtn}
            onClick={onReset}
          >
            <Filter size={12} aria-hidden="true" />
            Reset
          </button>
        )}
      </div>
    </div>
  );
}
