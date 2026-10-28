'use client';

import React, { useMemo } from 'react';
import type { RentSummaryDto } from '@cold-storage/contracts';
import { DataTable, type DataTableColumn } from '@/components/ui/DataTable';
import styles from '../page.module.css';

interface BatchGrnAllocationTableProps {
  customerGrns: RentSummaryDto[];
  allocations: Record<string, number>;
  onChange: (grnId: string, amount: number) => void;
  disabled?: boolean;
}

export function BatchGrnAllocationTable({
  customerGrns,
  allocations,
  onChange,
  disabled,
}: BatchGrnAllocationTableProps) {
  const columns: DataTableColumn<RentSummaryDto>[] = useMemo(
    () => [
      {
        key: 'grnNumber',
        header: 'GRN',
        render: (g) => (
          <span style={{ fontWeight: 'var(--font-medium)' }}>{g.grnNumber}</span>
        ),
      },
      {
        key: 'inwardDate',
        header: 'Inward Date',
        render: (g) => new Date(g.inwardDate).toLocaleDateString('en-IN'),
      },
      {
        key: 'totalDue',
        header: 'Total Due',
        align: 'right',
        render: (g) => `₹${g.totalDue.toLocaleString('en-IN')}`,
      },
      {
        key: 'remainingBalance',
        header: 'Balance',
        align: 'right',
        render: (g) => (
          <span
            style={{
              fontWeight: 'var(--font-semibold)',
              color: 'var(--color-primary)',
            }}
          >
            ₹{g.remainingBalance.toLocaleString('en-IN')}
          </span>
        ),
      },
      {
        key: 'settleAmount',
        header: 'Settle (₹)',
        align: 'right',
        render: (g) => (
          <input
            id={`settle-grn-${g.grnId}`}
            aria-label={`Settle amount for GRN ${g.grnNumber}`}
            type="number"
            min={0}
            max={g.remainingBalance}
            className={styles.input}
            style={{ width: 100, textAlign: 'right', padding: 'var(--space-1)' }}
            value={allocations[g.grnId] ?? ''}
            onChange={(e) => onChange(g.grnId, Number(e.target.value) || 0)}
            disabled={disabled}
          />
        ),
      },
    ],
    [allocations, disabled, onChange],
  );

  return (
    <div
      style={{
        maxHeight: 240,
        overflowY: 'auto',
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-sm)',
      }}
    >
      <DataTable<RentSummaryDto>
        columns={columns}
        rows={customerGrns}
        rowKey={(g) => g.grnId}
        caption="Customer open GRNs for batch settlement"
      />
    </div>
  );
}
