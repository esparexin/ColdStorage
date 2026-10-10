'use client';

import React from 'react';
import type { Commodity, Customer } from '@cold-storage/contracts';
import { FilterToolbar, Select } from '@/components/ui';
import type { GrnStatusTab } from '../hooks/useGrns';
import styles from './GrnFilterToolbar.module.css';

interface GrnFilterToolbarProps {
  searchTerm: string;
  onSearchChange: (value: string) => void;
  statusFilter: GrnStatusTab;
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
        id="grn-customer-filter"
        aria-label="Filter by Customer"
        value={customerFilter}
        className={`${styles.filterSelect} ${customerFilter ? styles.activeFilter : ''}`}
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
        className={`${styles.filterSelect} ${commodityFilter ? styles.activeFilter : ''}`}
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