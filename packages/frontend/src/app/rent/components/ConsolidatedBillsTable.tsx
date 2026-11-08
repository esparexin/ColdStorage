'use client';

import React, { useMemo } from 'react';
import type { DeliveryChallan } from '@cold-storage/contracts';
import { DataTable, type DataTableColumn } from '@/components/ui/DataTable';
import styles from '../page.module.css';

interface ConsolidatedBillsTableProps {
  deliveries: DeliveryChallan[];
  grandTotal: number;
}

export function ConsolidatedBillsTable({
  deliveries,
  grandTotal,
}: ConsolidatedBillsTableProps) {
  const columns: DataTableColumn<DeliveryChallan>[] = useMemo(
    () => [
      {
        key: 'challan',
        header: 'Gate Pass / Challan',
        render: (d) => (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontWeight: 'var(--font-medium)' }}>{d.challanNumber}</span>
            {d.gpNumber && (
              <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
                GP: {d.gpNumber}
              </span>
            )}
          </div>
        ),
      },
      {
        key: 'date',
        header: 'Date',
        render: (d) =>
          new Date(d.date).toLocaleDateString('en-IN', {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
          }),
      },
      {
        key: 'bags',
        header: 'Bags',
        align: 'right',
        render: (d) => `${d.totalBags.toLocaleString('en-IN')}`,
      },
      {
        key: 'billAmount',
        header: 'Bill Amount',
        align: 'right',
        render: (d) => `₹${(d.rentCharge ?? 0).toLocaleString('en-IN')}`,
      },
      {
        key: 'paid',
        header: 'Paid',
        align: 'right',
        render: (d) => (
          <span style={{ color: 'var(--color-success-text)' }}>
            ₹{(d.rentTotalPaid ?? 0).toLocaleString('en-IN')}
          </span>
        ),
      },
      {
        key: 'balance',
        header: 'Balance Due',
        align: 'right',
        render: (d) => (
          <span
            style={{
              fontWeight: 'var(--font-semibold)',
              color: 'var(--color-warning-text)',
            }}
          >
            ₹{(d.rentRemainingBalance ?? d.rentCharge ?? 0).toLocaleString('en-IN')}
          </span>
        ),
      },
    ],
    [],
  );

  return (
    <div className={styles.infoCard}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span className={styles.infoBlockTitle}>
          Consolidated Pending Bills ({deliveries.length})
        </span>
        <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
          Sequential FIFO Settlement
        </span>
      </div>
      <DataTable<DeliveryChallan>
        columns={columns}
        rows={deliveries}
        rowKey={(d) => d.id}
        caption="Consolidated pending outward rent bills for this GRN"
      />
      <div
        className={styles.infoRow}
        style={{
          borderTop: '1px solid var(--color-border)',
          paddingTop: 'var(--space-2)',
          marginTop: 'var(--space-1)',
        }}
      >
        <strong style={{ fontSize: 'var(--text-sm)' }}>Consolidated Grand Total</strong>
        <strong
          style={{
            fontSize: 'var(--text-sm)',
            color: 'var(--color-warning-text)',
          }}
        >
          ₹{grandTotal.toLocaleString('en-IN')}
        </strong>
      </div>
    </div>
  );
}
