'use client';

import React from 'react';
import { Filter, Search } from 'lucide-react';
import type { Commodity, Customer, GrnStatus } from '@cold-storage/contracts';
import styles from '../page.module.css';

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
  const hasActiveFilters = Boolean(
    statusFilter || customerFilter || commodityFilter || searchTerm,
  );

  return (
    <div className={styles.toolbar}>
      <div className={styles.searchGroup}>
        <Search size={16} color="var(--color-text-muted)" aria-hidden="true" />
        <input
          id="grn-search-input"
          type="text"
          placeholder="Search GRN #, Receipt, Customer, Vehicle..."
          value={searchTerm}
          onChange={(e) => onSearchChange(e.target.value)}
          className={styles.searchInput}
        />
      </div>

      <div className={styles.filtersGroup}>
        <select
          id="grn-status-filter"
          aria-label="Filter by GRN Status"
          className={styles.filterSelect}
          value={statusFilter}
          onChange={(e) => onStatusChange(e.target.value as '' | GrnStatus)}
        >
          <option value="">All Statuses</option>
          <option value="OPEN">Open (Active)</option>
          <option value="CLOSED">Closed (Completed)</option>
        </select>

        <select
          id="grn-customer-filter"
          aria-label="Filter by Customer"
          className={styles.filterSelect}
          value={customerFilter}
          onChange={(e) => onCustomerChange(e.target.value)}
        >
          <option value="">All Customers</option>
          {customers.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>

        <select
          id="grn-commodity-filter"
          aria-label="Filter by Commodity"
          className={styles.filterSelect}
          value={commodityFilter}
          onChange={(e) => onCommodityChange(e.target.value)}
        >
          <option value="">All Commodities</option>
          {commodities.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>

        {hasActiveFilters && (
          <button
            type="button"
            className={styles.clearFiltersBtn}
            onClick={onReset}
          >
            <Filter size={12} aria-hidden="true" />
            Reset
          </button>
        )}
      </div>
    </div>
  );
}
