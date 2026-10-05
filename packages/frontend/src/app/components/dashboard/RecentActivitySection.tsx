'use client';

import React from 'react';
import type { RecentActivityItem } from '@cold-storage/contracts';
import { DataTable, type DataTableColumn } from '@/components/ui/DataTable';
import { FeedbackStates } from '@/components/ui/FeedbackStates';
import { EMPTY_MESSAGES } from '@/components/ui/stateCopy';
import styles from '@/app/page.module.css';

const activityTypeLabel: Record<string, string> = {
  INWARD_PUTAWAY: 'Inward',
  OUTWARD_DELIVERY: 'Outward',
  DELIVERY_REVERSAL: 'Reversal',
};

const activityTypeAccent: Record<string, string> = {
  INWARD_PUTAWAY: styles.typeInward,
  OUTWARD_DELIVERY: styles.typeOutward,
  DELIVERY_REVERSAL: styles.typeReversal,
};

export function RecentActivitySection({ items }: { items: RecentActivityItem[] }) {
  const visibleItems = items.filter((row) => row.bags > 0);

  const activityColumns: DataTableColumn<RecentActivityItem>[] = [
    {
      key: 'type',
      header: 'Type',
      render: (row) => (
        <span className={`${styles.typeBadge} ${activityTypeAccent[row.type] ?? ''}`}>
          {activityTypeLabel[row.type] ?? row.type}
        </span>
      ),
    },
    {
      key: 'reference',
      header: 'Reference',
      render: (row) => <code className={styles.refCode}>{row.referenceNumber}</code>,
    },
    {
      key: 'chamber',
      header: 'Chamber',
      render: (row) => <code className={styles.refCode}>{row.chamber}</code>,
    },
    {
      key: 'bags',
      header: 'Bags',
      render: (row) => row.bags.toLocaleString('en-IN'),
      align: 'right',
    },
    {
      key: 'date',
      header: 'Date',
      render: (row) =>
        new Date(row.date).toLocaleString('en-IN', {
          timeZone: 'Asia/Kolkata',
          dateStyle: 'short',
          timeStyle: 'short',
        }),
      align: 'right',
    },
  ];

  return (
    <section className={styles.section} aria-label="Recent activity">
      <h2 className={styles.sectionTitle}>Recent Activity</h2>
      {visibleItems.length === 0 ? (
        <FeedbackStates.Empty message={EMPTY_MESSAGES.recentActivity} />
      ) : (
        <DataTable
          columns={activityColumns}
          rows={visibleItems}
          rowKey={(row) => row.id}
        />
      )}
    </section>
  );
}
