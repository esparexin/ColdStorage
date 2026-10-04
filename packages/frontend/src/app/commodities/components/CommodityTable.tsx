'use client';

import React from 'react';
import { CheckCircle2, XCircle } from 'lucide-react';
import type { Commodity } from '@cold-storage/contracts';
import { DataTable, type DataTableColumn } from '@/components/ui/DataTable';
import { Badge, Button } from '@/components/ui';

interface CommodityTableProps {
  commodities: Commodity[];
  canManage: boolean;
  page: number;
  pageSize: number;
  totalPages: number;
  totalCommodities: number;
  onPageChange: (page: number) => void;
  onToggleActive: (commodity: Commodity) => void;
}

export function CommodityTable({
  commodities,
  canManage,
  page,
  pageSize,
  totalPages,
  totalCommodities,
  onPageChange,
  onToggleActive,
}: CommodityTableProps) {
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
            render: (row: Commodity) => (
              <Button
                variant={row.isActive ? 'dangerOutline' : 'outline'}
                size="sm"
                onClick={() => void onToggleActive(row)}
                title={row.isActive ? 'Deactivate commodity' : 'Activate commodity'}
                leftIcon={
                  row.isActive ? (
                    <XCircle size={13} aria-hidden="true" color="var(--color-danger)" />
                  ) : (
                    <CheckCircle2 size={13} aria-hidden="true" color="var(--color-success)" />
                  )
                }
              >
                {row.isActive ? 'Deactivate' : 'Activate'}
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
      rows={commodities}
      rowKey={(row) => row.id}
      pagination={{
        page,
        pageSize,
        totalPages,
        totalRecords: totalCommodities,
        onPageChange,
      }}
      caption="Commodity catalog"
    />
  );
}
