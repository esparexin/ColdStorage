'use client';

import React from 'react';
import { FilterToolbar } from '@/components/ui';
import type { DeliveryRentStatusFilter } from '../hooks/deliveryFilter.helper';

export interface DeliveryFilterToolbarProps {
  searchTerm: string;
  onSearchChange: (v: string) => void;
  rentStatusFilter: DeliveryRentStatusFilter;
  onRentStatusChange: (v: DeliveryRentStatusFilter) => void;
  onReset: () => void;
}

export function DeliveryFilterToolbar({
  searchTerm,
  onSearchChange,
  rentStatusFilter,
  onRentStatusChange,
  onReset,
}: DeliveryFilterToolbarProps) {
  return (
    <FilterToolbar
      searchValue={searchTerm}
      onSearchChange={onSearchChange}
      searchPlaceholder="Search Challan #, GRN #, Customer, Vehicle, Marks..."
      searchAriaLabel="Search deliveries"
      searchInputId="delivery-search-input"
      selects={[
        {
          id: 'delivery-rent-status-filter',
          ariaLabel: 'Filter by Rent Payment Status',
          value: rentStatusFilter,
          onChange: (v) => onRentStatusChange(v as DeliveryRentStatusFilter),
          options: [
            { value: '', label: 'All Rent Statuses' },
            { value: 'DUE', label: 'Due Payment' },
            { value: 'SETTLED', label: 'Settled' },
          ],
        },
      ]}
      onReset={onReset}
      hasActiveFilters={Boolean(rentStatusFilter || searchTerm)}
    />
  );
}
