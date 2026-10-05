'use client';

import React from 'react';
import type { Commodity, Customer, GrnStatus } from '@cold-storage/contracts';
import { FilterToolbar, Select } from '@/components/ui';

interface GrnFilterToolbarProps {
  searchTerm: string;
  onSearchChange: (value: string) => void;
  statusFilter: '' | GrnStatus;
  onStatusChange: (status: '' | GrnStatus) => void;
  customerFilter: string;
  onCustomerChange: (customerId: string) => void;
  commodityFilter: string;
  onCommodityChange: (commodityId: string) => void;
  customers: Customer[];
  commodities: Commodity[];
  onReset: () => void;
}

export function GrnFilterToolbar({
  searchTerm,
  onSearchChange,
  statusFilter,
  onStatusChange,
  customerFilter,
  onCustomerChange,
  commodityFilter,
  onCommodityChange,
  customers,
  commodities,
  onReset,
}: GrnFilterToolbarProps) {
  return (
    <FilterToolbar
      searchValue={searchTerm}
      onSearchChange={onSearchChange}
      searchPlaceholder="Search GRN #, Bill #, Customer, Commodity, Vehicle, Bond #..."
      searchAriaLabel="Search GRNs"
      searchInputId="grn-search-input"
      onReset={onReset}
      hasActiveFilters={Boolean(
        statusFilter || customerFilter || commodityFilter || searchTerm,
      )}
    >
      <Select
        id="grn-status-filter"
        aria-label="Filter by GRN Status"
        value={statusFilter}
        onChange={(e) => onStatusChange(e.target.value as '' | GrnStatus)}
      >
        <option value="">All Statuses</option>
        <option value="OPEN">Open (Active)</option>
        <option value="CLOSED">Closed (Completed)</option>
      </Select>

      <Select
        id="grn-customer-filter"
        aria-label="Filter by Customer"
        value={customerFilter}
        onChange={(e) => onCustomerChange(e.target.value)}
      >
        <option value="">All Customers</option>
        {customers.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </Select>

      <Select
        id="grn-commodity-filter"
        aria-label="Filter by Commodity"
        value={commodityFilter}
        onChange={(e) => onCommodityChange(e.target.value)}
      >
        <option value="">All Commodities</option>
        {commodities.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </Select>
    </FilterToolbar>
  );
}