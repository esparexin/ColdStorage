'use client';

import React from 'react';
import { Filter } from 'lucide-react';
import type { DeliveryStatus } from '@cold-storage/contracts';
import { Button, SearchBar, Select } from '@/components/ui';
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
      <SearchBar
        id="delivery-search-input"
        value={searchTerm}
        onChange={onSearchChange}
        placeholder="Search Challan #, GRN #, Customer, Vehicle..."
        ariaLabel="Search deliveries"
        onClear={onReset}
      />

      <div className={styles.filtersGroup}>
        <Select
          id="delivery-status-filter"
          aria-label="Filter by Delivery Status"
          className={styles.filterSelect}
          value={statusFilter}
          onChange={(e) => onStatusChange(e.target.value as '' | DeliveryStatus)}
        >
          <option value="">All Statuses</option>
          <option value="ISSUED">Issued (Active)</option>
          <option value="REVERSED">Reversed</option>
        </Select>

        {hasActiveFilters && (
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
