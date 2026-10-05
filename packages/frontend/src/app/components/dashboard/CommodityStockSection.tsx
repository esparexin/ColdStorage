'use client';

import React from 'react';
import type { CommodityStock } from '@cold-storage/contracts';
import { DataTable, type DataTableColumn } from '@/components/ui/DataTable';
import { FeedbackStates } from '@/components/ui/FeedbackStates';
import styles from '@/app/page.module.css';

export function CommodityStockSection({
  items,
  totalOccupied,
}: {
  items: CommodityStock[];
  totalOccupied: number;
}) {
  const commodityColumns: DataTableColumn<CommodityStock>[] = [
    {
      key: 'name',
      header: 'Commodity',
      render: (row) => row.commodityName,
    },
    {
      key: 'bags',
      header: 'Bags in Storage',
      render: (row) => row.totalBags.toLocaleString('en-IN'),
      align: 'right',
    },
    {
      key: 'share',
      header: 'Share of Stock',
      render: (row) => {
        const pct =
          totalOccupied > 0 ? Math.round((row.totalBags / totalOccupied) * 100) : 0;
        return `${pct}%`;
      },
      align: 'right',
    },
  ];

  return (
    <section className={styles.section} aria-label="Commodity stock breakdown">
      <h2 className={styles.sectionTitle}>Commodity Stock</h2>
      {items.length === 0 ? (
        <FeedbackStates.Empty message="No commodity stock on hand." />
      ) : (
        <DataTable
          columns={commodityColumns}
          rows={items}
          rowKey={(row) => row.commodityId}
        />
      )}
    </section>
  );
}
