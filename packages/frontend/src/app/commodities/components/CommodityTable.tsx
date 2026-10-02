'use client';

import React from 'react';
import { CheckCircle2, XCircle } from 'lucide-react';
import type { Commodity } from '@cold-storage/contracts';
import { DataTable, type DataTableColumn } from '@/components/ui/DataTable';
import styles from '../page.module.css';

interface CommodityTableProps {
  commodities: Commodity[];
  canManage: boolean;
  onToggleActive: (commodity: Commodity) => void;
}

export function CommodityTable({ commodities, canManage, onToggleActive }: CommodityTableProps) {
  const columns: DataTableColumn<Commodity>[] = [
    {
      key: 'name',
      header: 'Commodity Name',
      render: (row) => <strong>{row.name}</strong>,
    },
    {
      key: 'status',
      header: 'Status',
      render: (row) => (
        <span className={row.isActive ? styles.statusActive : styles.statusInactive}>
          {row.isActive ? 'Active' : 'Inactive'}
        </span>
      ),
    },
    ...(canManage
      ? [
          {
            key: 'actions',
            header: 'Actions',
            render: (row: Commodity) => (
              <button
                type="button"
                className={styles.toggleBtn}
                onClick={() => void onToggleActive(row)}
                title={row.isActive ? 'Deactivate commodity' : 'Activate commodity'}
              >
                {row.isActive ? (
                  <>
                    <XCircle size={13} aria-hidden="true" color="var(--color-danger)" />
                    <span>Deactivate</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 size={13} aria-hidden="true" color="var(--color-success)" />
                    <span>Activate</span>
                  </>
                )}
              </button>
            ),
            align: 'right' as const,
          },
        ]
      : []),
  ];

  return (
    <DataTable
      columns={columns}
      rows={commodities}
      rowKey={(row) => row.id}
      caption="Commodity catalog"
    />
  );
}
