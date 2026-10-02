'use client';

import React from 'react';
import { AlertTriangle } from 'lucide-react';
import type { ChamberUtilization } from '@cold-storage/contracts';
import { DataTable, type DataTableColumn } from '@/components/ui/DataTable';
import styles from '@/app/page.module.css';

function UtilizationBar({ rate, isActive }: { rate: number; isActive: boolean }) {
  const color =
    !isActive
      ? 'var(--color-inactive)'
      : rate >= 90
        ? 'var(--color-danger)'
        : rate >= 70
          ? 'var(--color-warning)'
          : 'var(--color-success)';

  return (
    <div
      className={styles.utilBar}
      role="meter"
      aria-valuenow={rate}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={`${rate}% utilization`}
    >
      <div
        className={styles.utilFill}
        style={{ width: `${Math.min(rate, 100)}%`, background: color }}
      />
    </div>
  );
}

export function ChamberUtilizationSection({ items }: { items: ChamberUtilization[] }) {
  const chamberColumns: DataTableColumn<ChamberUtilization>[] = [
    {
      key: 'chamber',
      header: 'Chamber',
      render: (row) => (
        <span className={styles.chamberLabel}>
          {row.chamberNumber}
          {!row.isActive && (
            <span className={styles.inactiveBadge} title="Inactive chamber">
              INACTIVE
            </span>
          )}
        </span>
      ),
    },
    {
      key: 'capacity',
      header: 'Capacity',
      render: (row) => row.capacityBags.toLocaleString('en-IN'),
      align: 'right',
    },
    {
      key: 'occupied',
      header: 'Occupied',
      render: (row) => row.occupiedBags.toLocaleString('en-IN'),
      align: 'right',
    },
    {
      key: 'available',
      header: 'Available',
      render: (row) => row.availableBags.toLocaleString('en-IN'),
      align: 'right',
    },
    {
      key: 'utilization',
      header: 'Utilization',
      render: (row) => (
        <div className={styles.utilCell}>
          <UtilizationBar rate={row.utilizationRate} isActive={row.isActive} />
          <span className={styles.utilPct}>{row.utilizationRate.toFixed(1)}%</span>
        </div>
      ),
    },
  ];

  return (
    <section className={styles.section} aria-label="Chamber utilization">
      <h2 className={styles.sectionTitle}>
        <AlertTriangle size={18} aria-hidden="true" />
        Chamber Utilization
      </h2>
      <DataTable
        columns={chamberColumns}
        rows={items}
        rowKey={(row) => row.chamberId}
        caption="Chamber utilization breakdown"
      />
    </section>
  );
}
