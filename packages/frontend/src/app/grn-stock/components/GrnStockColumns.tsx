import React from 'react';
import { Eye, Trash2 } from 'lucide-react';
import type { Grn } from '@cold-storage/contracts';
import type { DataTableColumn } from '@/components/ui/DataTable';
import { Badge, Button } from '@/components/ui';
import { formatDisplayDate } from '@/lib/date-format';

import {
  type MergeInInfo,
  resolveMovementDate,
  resolveMovementType,
} from '../utils/grnStockMovementColumn.helper';
export type { MergeInInfo };

interface CreateGrnStockColumnsParams {
  onOpenMovement: (grn: Grn) => void;
  onMerge?: (grn: Grn) => void;
  onDelete?: (grn: Grn) => void;
  mergeInMap?: Map<string, MergeInInfo>;
}

export function createGrnStockColumns({
  onOpenMovement,
  onMerge,
  onDelete,
  mergeInMap,
}: CreateGrnStockColumnsParams): DataTableColumn<Grn>[] {
  return [
    {
      key: 'date',
      header: 'Inward Date',
      sortable: true,
      sortType: 'date',
      sortAccessor: (row) => row.date,
      render: (row) => (
        <span
          style={{
            fontSize: 'var(--text-xs)',
            color: 'var(--color-text-secondary)',
            whiteSpace: 'nowrap',
          }}
        >
          {formatDisplayDate(row.date)}
        </span>
      ),
    },
    {
      key: 'grnNumber',
      header: 'GRN #',
      sortable: true,
      sortType: 'text',
      sortAccessor: (row) => row.grnNumber,
      render: (row) => (
        <span
          style={{
            fontWeight: 'var(--font-semibold)',
            color: 'var(--color-text-primary)',
            whiteSpace: 'nowrap',
          }}
        >
          {row.grnNumber}
        </span>
      ),
    },
    {
      key: 'customerName',
      header: 'Customer',
      sortable: true,
      sortType: 'text',
      sortAccessor: (row) => row.customerName,
      render: (row) => <span style={{ fontWeight: 'var(--font-medium)' }}>{row.customerName}</span>,
    },
    {
      key: 'commodityName',
      header: 'Commodity',
      sortable: true,
      sortType: 'text',
      sortAccessor: (row) => row.commodityName,
      render: (row) => row.commodityName,
    },
    {
      key: 'bags',
      header: 'Received',
      align: 'right',
      sortable: true,
      sortType: 'number',
      sortAccessor: (row) => row.bags,
      render: (row) => (
        <div style={{ textAlign: 'right' }}>
          <span style={{ fontWeight: 'var(--font-semibold)', fontVariantNumeric: 'tabular-nums' }}>
            {row.bags.toLocaleString('en-IN')}
          </span>
          <span
            style={{
              display: 'block',
              fontSize: 'var(--text-xs)',
              color: 'var(--color-text-muted)',
            }}
          >
            S/B: {row.bagType ?? 'S/B'}
          </span>
        </div>
      ),
    },
    {
      key: 'netDeliveredBags',
      header: 'Outward',
      align: 'right',
      sortable: true,
      sortType: 'number',
      sortAccessor: (row) => row.netDeliveredBags ?? 0,
      render: (row) => {
        const outward = row.netDeliveredBags ?? 0;
        return (
          <span
            style={{
              fontVariantNumeric: 'tabular-nums',
              color: outward > 0 ? 'var(--color-text-primary)' : 'var(--color-text-muted)',
            }}
          >
            {outward > 0 ? outward.toLocaleString('en-IN') : '—'}
          </span>
        );
      },
    },
    {
      key: 'closingBags',
      header: 'Balance',
      align: 'right',
      sortable: true,
      sortType: 'number',
      sortAccessor: (row) => row.closingBags ?? row.bags,
      render: (row) => {
        const balance = row.closingBags ?? row.bags;
        return (
          <span
            style={{
              fontWeight: 'var(--font-bold)',
              fontVariantNumeric: 'tabular-nums',
              color: 'var(--color-text-primary)',
            }}
          >
            {balance.toLocaleString('en-IN')}
          </span>
        );
      },
    },
    {
      key: 'status',
      header: 'Status',
      sortable: true,
      sortType: 'text',
      sortAccessor: (row) => row.status,
      render: (row) => (
        <Badge variant={row.status === 'CLOSED' ? 'neutral' : 'warning'}>{row.status}</Badge>
      ),
    },
    {
      key: 'type',
      header: 'Type',
      sortable: true,
      sortType: 'text',
      sortAccessor: (row) => resolveMovementType(row, mergeInMap).label,
      render: (row) => {
        const res = resolveMovementType(row, mergeInMap);
        if (res.kind === 'merge' || res.kind === 'merge-in') {
          return <Badge variant="primary">{res.label}</Badge>;
        }
        if (res.kind === 'outward') {
          return <Badge variant="neutral">Outward</Badge>;
        }
        return <span style={{ color: 'var(--color-text-muted)' }}>—</span>;
      },
    },
    {
      key: 'closureDate',
      header: 'Movement Date',
      sortable: true,
      sortType: 'date',
      sortAccessor: (row) => {
        const d = resolveMovementDate(row, mergeInMap);
        return d ? new Date(d).getTime() : 0;
      },
      render: (row) => {
        const d = resolveMovementDate(row, mergeInMap);
        if (!d) return <span style={{ color: 'var(--color-text-muted)' }}>—</span>;
        return (
          <span
            style={{
              fontSize: 'var(--text-xs)',
              color: 'var(--color-text-secondary)',
              whiteSpace: 'nowrap',
            }}
          >
            {formatDisplayDate(d)}
          </span>
        );
      },
    },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right',
      render: (row) => (
        <div style={{ display: 'flex', gap: 'var(--space-1)', justifyContent: 'flex-end' }}>
          <Button
            variant="secondary"
            size="sm"
            onClick={(e) => { e.stopPropagation(); onOpenMovement(row); }}
            title={`View GRN Stock Movement for ${row.grnNumber}`}
            aria-label={`View GRN Stock Movement for ${row.grnNumber}`}
            leftIcon={<Eye size={14} aria-hidden="true" />}
          >
            View
          </Button>
          {row.status === 'OPEN' && onMerge && (
            <Button
              variant="outline"
              size="sm"
              onClick={(e) => { e.stopPropagation(); onMerge(row); }}
              title={`Merge GRNs into ${row.grnNumber}`}
              aria-label={`Merge GRNs into ${row.grnNumber}`}
            >
              Merge
            </Button>
          )}
          {row.status === 'OPEN' && onDelete && (
            <Button
              variant="dangerOutline"
              size="sm"
              onClick={(e) => { e.stopPropagation(); onDelete(row); }}
              title={`Delete GRN ${row.grnNumber} (testing only)`}
              aria-label={`Delete GRN ${row.grnNumber} (testing only)`}
              leftIcon={<Trash2 size={14} aria-hidden="true" />}
            >
              Delete
            </Button>
          )}
        </div>
      ),
    },
  ];
}
