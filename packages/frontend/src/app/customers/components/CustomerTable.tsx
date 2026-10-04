'use client';

import React from 'react';
import { Edit2 } from 'lucide-react';
import type { Customer } from '@cold-storage/contracts';
import { DataTable, type DataTableColumn } from '@/components/ui/DataTable';
import { Badge, Button } from '@/components/ui';

interface CustomerTableProps {
  customers: Customer[];
  canManage: boolean;
  page: number;
  pageSize: number;
  totalPages: number;
  totalCustomers: number;
  onPageChange: (page: number) => void;
  onEdit: (customer: Customer) => void;
}

export function CustomerTable({
  customers,
  canManage,
  page,
  pageSize,
  totalPages,
  totalCustomers,
  onPageChange,
  onEdit,
}: CustomerTableProps) {
  const columns: DataTableColumn<Customer>[] = [
    {
      key: 'name',
      header: 'Customer Name',
      render: (row) => <strong>{row.name}</strong>,
    },
    {
      key: 'status',
      header: 'Status',
      render: (row) => (
        <Badge variant={row.isActive ? 'success' : 'neutral'}>
          {row.isActive ? 'Active' : 'Inactive'}
        </Badge>
      ),
    },
    ...(canManage
      ? [
          {
            key: 'actions',
            header: 'Actions',
            render: (row: Customer) => (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onEdit(row)}
                title="Edit customer details"
                leftIcon={<Edit2 size={13} aria-hidden="true" />}
              >
                Edit
              </Button>
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
      pagination={{ page, pageSize, totalPages, totalRecords: totalCustomers, onPageChange }}
      caption="Registered customer directory"
    />
  );
}
