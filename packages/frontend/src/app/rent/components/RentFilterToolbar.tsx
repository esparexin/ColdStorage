'use client';

import React from 'react';
import { FilterToolbar } from '@/components/ui';
import type { RentStatusFilter, RentTypeFilter } from '../hooks/rentFilter.helper';

export interface RentFilterToolbarProps {
  searchTerm: string;
  onSearchChange: (v: string) => void;
  statusFilter: RentStatusFilter;
  onStatusChange: (v: RentStatusFilter) => void;
  typeFilter: RentTypeFilter;
  onTypeChange: (v: RentTypeFilter) => void;
  onReset: () => void;
}

export function RentFilterToolbar({
  searchTerm,
  onSearchChange,
  statusFilter,
  onStatusChange,
  typeFilter,
  onTypeChange,
  onReset,
}: RentFilterToolbarProps) {
  return (
    <FilterToolbar
      searchValue={searchTerm}
      onSearchChange={onSearchChange}
      searchPlaceholder="Search GRN #, Customer, Commodity, Chamber, Receipt #..."
      searchAriaLabel="Search rent billing accounts"
      searchInputId="rent-search-input"
      selects={[
        {
          id: 'rent-status-filter',
          ariaLabel: 'Filter by Rent Settlement Status',
          value: statusFilter,
          onChange: (v) => onStatusChange(v as RentStatusFilter),
          options: [
            { value: '', label: 'All Payment Statuses' },
            { value: 'PENDING_DUES', label: 'Pending Dues' },
            { value: 'SETTLED', label: 'Settled (Fully Paid)' },
            { value: 'NO_DUES', label: 'No Dues (At Outward)' },
          ],
        },
        {
          id: 'rent-type-filter',
          ariaLabel: 'Filter by Rent Structure',
          value: typeFilter,
          onChange: (v) => onTypeChange(v as RentTypeFilter),
          options: [
            { value: '', label: 'All Rent Types' },
            { value: 'Seasonal', label: 'Seasonal' },
            { value: 'Monthly', label: 'Monthly' },
          ],
        },
      ]}
      onReset={onReset}
      hasActiveFilters={Boolean(statusFilter || typeFilter || searchTerm)}
    />
  );
}
