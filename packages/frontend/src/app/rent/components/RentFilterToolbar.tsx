'use client';

import React from 'react';
import type { PaymentStatus } from '@cold-storage/contracts';
import { FilterToolbar, Select } from '@/components/ui';

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
    <FilterToolbar
      searchValue={searchTerm}
      onSearchChange={onSearchChange}
      searchPlaceholder="Search GRN #, Customer, Mobile, Commodity..."
      searchAriaLabel="Search rent billing"
      searchInputId="rent-search-input"
      onReset={onReset}
      hasActiveFilters={Boolean(statusFilter || searchTerm)}
    >
      <Select
        id="rent-status-filter"
        aria-label="Filter by Payment Status"
        value={statusFilter}
        onChange={(e) => onStatusChange(e.target.value as '' | PaymentStatus)}
      >
        <option value="">All Payment Statuses</option>
        <option value="Not Settled">Not Settled (Pending Dues)</option>
        <option value="Settled">Settled (Fully Paid)</option>
      </Select>
    </FilterToolbar>
  );
}