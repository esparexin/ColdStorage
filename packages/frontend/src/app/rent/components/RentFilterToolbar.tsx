'use client';

import React from 'react';
import { FilterToolbar } from '@/components/ui';
import type { RentStatusFilter, RentTypeFilter } from '../hooks/rentFilter.helper';

export interface RentFilterToolbarProps {
  searchTerm: string;
  onSearchChange: (v: string) => void;
  statusFilter?: RentStatusFilter;
  onStatusChange?: (v: RentStatusFilter) => void;
  typeFilter: RentTypeFilter;
  onTypeChange: (v: RentTypeFilter) => void;
  onReset: () => void;
  hasActiveFilters?: boolean;
}

export function RentFilterToolbar({
  searchTerm,
  onSearchChange,
  statusFilter,
  typeFilter,
  onTypeChange,
  onReset,
  hasActiveFilters,
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
          id: 'rent-type-filter',
          ariaLabel: 'Filter by Rent Structure',
          value: typeFilter,
          onChange: (v) => onTypeChange(v as RentTypeFilter),
          options: [
            { value: '', label: 'All Rent Types' },
            { value: 'Seasonal', label: 'Seasonal' },
            { value: 'Seasonal_3M', label: 'Seasonal (3 Months)' },
            { value: 'Monthly', label: 'Monthly' },
          ],
        },
      ]}
      onReset={onReset}
      hasActiveFilters={hasActiveFilters ?? Boolean(statusFilter || typeFilter || searchTerm)}
    />
  );
}
