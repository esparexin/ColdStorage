'use client';

import React from 'react';
import { Activity } from 'lucide-react';
import type { RecentActivityItem } from '@cold-storage/contracts';
import { DataTable, type DataTableColumn } from '@/components/ui/DataTable';
import { FeedbackStates } from '@/components/ui/FeedbackStates';
import styles from '@/app/page.module.css';

const activityTypeLabel: Record<string, string> = {
  INWARD_PUTAWAY: 'Put Away',
  OUTWARD_DELIVERY: 'Delivery',
  DELIVERY_REVERSAL: 'Reversal',
};

const activityTypeAccent: Record<string, string> = {
  INWARD_PUTAWAY: styles.typeInward,
  OUTWARD_DELIVERY: styles.typeOutward,
  DELIVERY_REVERSAL: styles.typeReversal,
};

export function RecentActivitySection({ items }: { items: RecentActivityItem[] }) {
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
      <h2 className={styles.sectionTitle}>
        <Activity size={18} aria-hidden="true" />
        Recent Activity
      </h2>
      {items.length === 0 ? (
        <FeedbackStates.Empty message="No recent activity." />
      ) : (
        <DataTable
          columns={activityColumns}
          rows={items}
          rowKey={(row) => row.id}
          caption="Latest 10 inventory transactions"
        />
      )}
    </section>
  );
}
