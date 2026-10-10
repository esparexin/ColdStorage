'use client';

import React from 'react';
import { CheckCircle2, XCircle } from 'lucide-react';
import type { Commodity, CommodityRate } from '@cold-storage/contracts';
import { DataTable, type DataTableColumn, type DataTableColumnGroup } from '@/components/ui/DataTable';
import { Badge, Button } from '@/components/ui';
import { hydrateRatesForm, type CommodityRatesFormState } from './commodityRates.helper';

interface CommodityTableProps {
  commodities: Commodity[];
  ratesMap?: Record<string, CommodityRate[]>;
  ratesLoading?: boolean;
  canManage: boolean;
  page: number;
  pageSize: number;
  totalPages: number;
  totalCommodities: number;
  onPageChange: (page: number) => void;
  onToggleActive: (commodity: Commodity) => void;
  onRequestDeactivate?: (commodity: Commodity) => void;
  onManageRates: (commodity: Commodity) => void;
}

export function CommodityTable({
  commodities,
  ratesMap,
  ratesLoading,
  canManage,
  page,
  pageSize,
  totalPages,
  totalCommodities,
  onPageChange,
  onToggleActive,
  onRequestDeactivate,
  onManageRates,
}: CommodityTableProps) {
  const groups: DataTableColumnGroup[] = [
    { key: 'seasonal', header: 'Seasonal', align: 'center', borderLeft: true },
    { key: 'monthly', header: 'Monthly', align: 'center', borderLeft: true },
  ];

  const getRate = (commodityId: string, field: keyof CommodityRatesFormState): number | '' => {
    const commodityRates = ratesMap?.[commodityId];
    if (!commodityRates || commodityRates.length === 0) return '';
    const hydrated = hydrateRatesForm(commodityRates);
    return hydrated ? hydrated[field] : '';
  };

  const formatRateCell = (val: number | '', commodityId: string) => {
    if (ratesLoading && !ratesMap?.[commodityId]) {
      return <span style={{ color: 'var(--color-text-muted)' }}>…</span>;
    }
    if (typeof val !== 'number') {
      return <span style={{ color: 'var(--color-text-muted)' }}>—</span>;
    }
    return (
      <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 'var(--font-medium)' }}>
        ₹{val % 1 === 0 ? val : val.toFixed(2)}
      </span>
    );
  };

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
    {
      key: 'seasonalSmall',
      group: 'seasonal',
      header: 'Small',
      align: 'right',
      borderLeft: true,
      render: (row) => formatRateCell(getRate(row.id, 'seasonalSmall'), row.id),
    },
    {
      key: 'seasonalBig',
      group: 'seasonal',
      header: 'Big',
      align: 'right',
      borderLeft: true,
      render: (row) => formatRateCell(getRate(row.id, 'seasonalBig'), row.id),
    },
    {
      key: 'monthlySmall',
      group: 'monthly',
      header: 'Small',
      align: 'right',
      borderLeft: true,
      render: (row) => formatRateCell(getRate(row.id, 'monthlySmall'), row.id),
    },
    {
      key: 'monthlyBig',
      group: 'monthly',
      header: 'Big',
      align: 'right',
      borderLeft: true,
      render: (row) => formatRateCell(getRate(row.id, 'monthlyBig'), row.id),
    },
    ...(canManage
      ? [
          {
            key: 'actions',
            header: 'Actions',
            borderLeft: true,
            render: (row: Commodity) => (
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-2)' }}>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onManageRates(row)}
                  title={`Manage rates for ${row.name}`}
                  aria-label={`Manage rates for commodity ${row.name}`}
                >
                  Rates
                </Button>
                <Button
                  variant={row.isActive ? 'dangerOutline' : 'outline'}
                  size="sm"
                  onClick={() => {
                    if (row.isActive && onRequestDeactivate) {
                      onRequestDeactivate(row);
                    } else {
                      void onToggleActive(row);
                    }
                  }}
                  title={row.isActive ? 'Deactivate commodity' : 'Activate commodity'}
                  aria-label={`${row.isActive ? 'Deactivate' : 'Activate'} commodity ${row.name}`}
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
              </div>
            ),
            align: 'right' as const,
          },
        ]
      : []),
  ];

  return (
    <DataTable
      columns={columns}
      groups={groups}
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
