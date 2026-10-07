'use client';

import React from 'react';
import type { DeliveryStatus } from '@cold-storage/contracts';
import { FilterToolbar } from '@/components/ui';
import type { DeliveryRentStatusFilter } from '../hooks/deliveryFilter.helper';

export interface DeliveryFilterToolbarProps {
  searchTerm: string;
  onSearchChange: (v: string) => void;
  statusFilter: '' | DeliveryStatus;
  onStatusChange: (v: '' | DeliveryStatus) => void;
  rentStatusFilter: DeliveryRentStatusFilter;
  onRentStatusChange: (v: DeliveryRentStatusFilter) => void;
  onReset: () => void;
}

export function DeliveryFilterToolbar({
  searchTerm,
  onSearchChange,
  statusFilter,
  onStatusChange,
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
          id: 'delivery-status-filter',
          ariaLabel: 'Filter by Delivery Status',
          value: statusFilter,
          onChange: (v) => onStatusChange(v as '' | DeliveryStatus),
          options: [
            { value: '', label: 'All Statuses' },
            { value: 'ISSUED', label: 'Issued (Active)' },
            { value: 'REVERSED', label: 'Reversed' },
          ],
        },
        {
          id: 'delivery-rent-status-filter',
          ariaLabel: 'Filter by Rent Settlement Status',
          value: rentStatusFilter,
          onChange: (v) => onRentStatusChange(v as DeliveryRentStatusFilter),
          options: [
            { value: '', label: 'All Rent Statuses' },
            { value: 'SETTLED', label: 'Settled (Paid)' },
            { value: 'PENDING', label: 'Pending Dues' },
          ],
        },
      ]}
      onReset={onReset}
      hasActiveFilters={Boolean(statusFilter || rentStatusFilter || searchTerm)}
    />
  );
}
