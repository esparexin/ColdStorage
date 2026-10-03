'use client';

import React from 'react';
import { Filter } from 'lucide-react';
import type { PaymentStatus } from '@cold-storage/contracts';
import { Button, SearchBar } from '@/components/ui';
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
      <SearchBar
        id="rent-search-input"
        value={searchTerm}
        onChange={onSearchChange}
        placeholder="Search GRN #, Customer, Mobile, Commodity..."
        ariaLabel="Search rent billing"
        onClear={onReset}
      />

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
          <Button
            variant="secondary"
            size="sm"
            onClick={onReset}
            leftIcon={<Filter size={12} aria-hidden="true" />}
          >
            Reset
          </Button>
        )}
      </div>
    </div>
  );
}
