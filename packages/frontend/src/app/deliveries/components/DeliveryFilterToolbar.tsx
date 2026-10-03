'use client';

import React from 'react';
import type { DeliveryStatus } from '@cold-storage/contracts';
import { FilterToolbar, Select } from '@/components/ui';

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
  return (
    <FilterToolbar
      searchValue={searchTerm}
      onSearchChange={onSearchChange}
      searchPlaceholder="Search Challan #, GRN #, Customer, Vehicle..."
      searchAriaLabel="Search deliveries"
      searchInputId="delivery-search-input"
      onReset={onReset}
      hasActiveFilters={Boolean(statusFilter || searchTerm)}
    >
      <Select
        id="delivery-status-filter"
        aria-label="Filter by Delivery Status"
        value={statusFilter}
        onChange={(e) => onStatusChange(e.target.value as '' | DeliveryStatus)}
      >
        <option value="">All Statuses</option>
        <option value="ISSUED">Issued (Active)</option>
        <option value="REVERSED">Reversed</option>
      </Select>
    </FilterToolbar>
  );
}