'use client';

import React from 'react';
import { Warehouse } from 'lucide-react';
import type { ChamberStock } from '@cold-storage/contracts';
import { DataTable, type DataTableColumn } from '@/components/ui/DataTable';
import styles from '@/app/page.module.css';

/**
 * Stock held per free-text chamber label. There is no capacity, availability or utilization
 * column: chamber is a label, not a capacity-managed slot, so there is no denominator to show.
 */
export function ChamberStockSection({ items }: { items: ChamberStock[] }) {
  const columns: DataTableColumn<ChamberStock>[] = [
    {
      key: 'chamber',
      header: 'Chamber',
      render: (row) => <span className={styles.chamberLabel}>{row.chamber}</span>,
    },
    {
      key: 'totalBags',
      header: 'Bags Stored',
      render: (row) => row.totalBags.toLocaleString('en-IN'),
      align: 'right',
    },
  ];

  return (
    <section className={styles.section} aria-label="Stock by chamber">
      <h2 className={styles.sectionTitle}>
        <Warehouse size={18} aria-hidden="true" />
        Stock by Chamber
      </h2>
      <DataTable
        columns={columns}
        rows={items}
        rowKey={(row) => row.chamber}
        caption="Bags stored in each chamber"
      />
    </section>
  );
}
