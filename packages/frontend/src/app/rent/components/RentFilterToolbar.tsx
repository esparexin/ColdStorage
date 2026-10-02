'use client';

import React from 'react';
import { Filter, Search } from 'lucide-react';
import type { PaymentStatus } from '@cold-storage/contracts';
import styles from '../page.module.css';

interface RentFilterToolbarProps {
  searchTerm: string;
  onSearchChange: (value: string) => void;
  statusFilter: '' | PaymentStatus;
  onStatusChange: (status: '' | PaymentStatus) => void;
  onReset: () => void;
}

export function RentFilterToolbar({
  searchTerm,
  onSearchChange,
  statusFilter,
  onStatusChange,
  onReset,
}: RentFilterToolbarProps) {
  return (
    <div className={styles.toolbar}>
      <div className={styles.searchGroup}>
        <Search size={16} color="var(--color-text-muted)" aria-hidden="true" />
        <input
          id="rent-search-input"
          type="text"
          placeholder="Search GRN #, Customer, Mobile, Commodity..."
          value={searchTerm}
          onChange={(e) => onSearchChange(e.target.value)}
          className={styles.searchInput}
        />
      </div>

      <div className={styles.filtersGroup}>
        <select
          id="rent-status-filter"
          aria-label="Filter by Payment Status"
          className={styles.filterSelect}
          value={statusFilter}
          onChange={(e) => onStatusChange(e.target.value as '' | PaymentStatus)}
        >
          <option value="">All Payment Statuses</option>
          <option value="Not Settled">Not Settled (Pending Dues)</option>
          <option value="Settled">Settled (Fully Paid)</option>
        </select>

        {(statusFilter || searchTerm) && (
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
