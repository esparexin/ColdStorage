'use client';

import React from 'react';
import { Filter, Search } from 'lucide-react';
import type { InventoryTransaction } from '@cold-storage/contracts';
import { DataTable, type DataTableColumn } from '@/components/ui/DataTable';
import { FeedbackStates } from '@/components/ui/FeedbackStates';
import type { useStockLedger } from '../hooks/useStockLedger';
import styles from '../page.module.css';

interface LedgerTabProps {
  ledger: ReturnType<typeof useStockLedger>;
  currentFacilityName: string;
}

export function LedgerTab({ ledger, currentFacilityName }: LedgerTabProps) {
  const ledgerColumns: DataTableColumn<InventoryTransaction>[] = [
    {
      key: 'createdAt',
      header: 'Timestamp',
      render: (r) => (
        <span>
          {new Date(r.createdAt).toLocaleString('en-IN', {
            dateStyle: 'medium',
            timeStyle: 'short',
          })}
        </span>
      ),
    },
    {
      key: 'transactionType',
      header: 'Event Type',
      render: (r) => (
        <span
          className={
            r.transactionType === 'INWARD_PUTAWAY'
              ? styles.typePutAway
              : r.transactionType === 'OUTWARD_DELIVERY'
                ? styles.typeDelivery
                : styles.typeReversal
          }
        >
          {r.transactionType}
        </span>
      ),
    },
    {
      key: 'grnNumber',
      header: 'GRN #',
      render: (r) => <span style={{ fontWeight: 600 }}>{r.grnNumber}</span>,
    },
    {
      key: 'positionCode',
      header: 'Storage Location',
      render: (r) => (
        <span style={{ fontFamily: 'var(--font-mono, monospace)' }}>{r.positionCode}</span>
      ),
    },
    {
      key: 'quantity',
      header: 'Bags',
      align: 'right',
      render: (r) => (
        <span style={{ fontWeight: 600 }}>
          {r.transactionType === 'OUTWARD_DELIVERY' ? `-${r.quantity}` : `+${r.quantity}`}
        </span>
      ),
    },
    {
      key: 'createdBy',
      header: 'Operator',
      render: (r) => (
        <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
          {r.createdBy}
        </span>
      ),
    },
  ];

  return (
    <div className={styles.tabContent}>
      <div className={styles.ledgerToolbar}>
        <div className={styles.searchGroup}>
          <Search size={16} color="var(--color-text-muted)" aria-hidden="true" />
          <input
            type="text"
            placeholder="Search GRN # or Storage Location..."
            value={ledger.ledgerSearch}
            onChange={(e) => ledger.setLedgerSearch(e.target.value)}
            className={styles.searchInput}
          />
        </div>

        <div className={styles.filtersGroup}>
          <select
            aria-label="Filter by Transaction Type"
            className={styles.filterSelect}
            value={ledger.ledgerTypeFilter}
            onChange={(e) => ledger.setLedgerTypeFilter(e.target.value)}
          >
            <option value="">All Transaction Types</option>
            <option value="INWARD_PUTAWAY">Inward Put-Away (+)</option>
            <option value="OUTWARD_DELIVERY">Outward Delivery (-)</option>
            <option value="DELIVERY_REVERSAL">Delivery Reversal (+)</option>
          </select>

          {(ledger.ledgerSearch || ledger.ledgerTypeFilter) && (
            <button
              type="button"
              className={styles.clearFiltersBtn}
              onClick={() => {
                ledger.setLedgerSearch('');
                ledger.setLedgerTypeFilter('');
              }}
            >
              <Filter size={12} aria-hidden="true" />
              Reset
            </button>
          )}
        </div>
      </div>

      {ledger.ledgerLoading ? (
        <FeedbackStates.Loading label="Loading stock ledger events..." />
      ) : ledger.ledgerItems.length === 0 ? (
        <FeedbackStates.Empty
          message={`No inventory transactions recorded for ${currentFacilityName} yet.`}
        />
      ) : (
        <DataTable
          columns={ledgerColumns}
          rows={ledger.filteredLedger}
          rowKey={(r) => r.id}
          caption="Immutable Inventory Transaction Ledger"
        />
      )}
    </div>
  );
}
