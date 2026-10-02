'use client';

import React from 'react';
import { Edit2 } from 'lucide-react';
import type { Customer } from '@cold-storage/contracts';
import { DataTable, type DataTableColumn } from '@/components/ui/DataTable';
import styles from '../page.module.css';

interface CustomerTableProps {
  customers: Customer[];
  canManage: boolean;
  onEdit: (customer: Customer) => void;
}

export function CustomerTable({ customers, canManage, onEdit }: CustomerTableProps) {
  const columns: DataTableColumn<Customer>[] = [
    {
      key: 'name',
      header: 'Customer Name',
      render: (row) => <strong>{row.name}</strong>,
    },
    {
      key: 'mobile',
      header: 'Mobile',
      render: (row) => <code>+91 {row.mobile}</code>,
    },
    {
      key: 'address',
      header: 'Address',
      render: (row) => row.address || '—',
    },
    {
      key: 'gstin',
      header: 'GSTIN',
      render: (row) => (row.gstin ? <code>{row.gstin}</code> : '—'),
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
            render: (row: Customer) => (
              <button
                type="button"
                className={styles.editBtn}
                onClick={() => onEdit(row)}
                title="Edit customer details"
              >
                <Edit2 size={13} aria-hidden="true" />
                <span>Edit</span>
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
      rows={customers}
      rowKey={(row) => row.id}
      caption="Registered customer directory"
    />
  );
}
