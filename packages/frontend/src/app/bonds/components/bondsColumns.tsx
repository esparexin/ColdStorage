import React from 'react';
import { Eye } from 'lucide-react';
import type { Grn } from '@cold-storage/contracts';
import type { DataTableColumn } from '@/components/ui/DataTable';
import { Badge, Button } from '@/components/ui';
import { formatDisplayDate } from '@/lib/date-format';

interface CreateBondsColumnsParams {
  onOpenDetail: (grn: Grn) => void;
}

export function createBondsColumns({
  onOpenDetail,
}: CreateBondsColumnsParams): DataTableColumn<Grn>[] {
  return [
    {
      key: 'customerName',
      header: 'Customer',
      sortable: true,
      sortType: 'text',
      sortAccessor: (row) => row.customerName,
      render: (row) => (
        <span style={{ fontWeight: 'var(--font-semibold)' }}>{row.customerName}</span>
      ),
    },
    {
      key: 'grnNumber',
      header: 'GRN / Bond #',
      sortable: true,
      sortType: 'text',
      sortAccessor: (row) => row.grnNumber,
      render: (row) => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-0-5)' }}>
          <span style={{ fontWeight: 'var(--font-medium)', whiteSpace: 'nowrap' }}>
            {row.grnNumber}
          </span>
          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
            {formatDisplayDate(row.date)}
          </span>
        </div>
      ),
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
      key: 'loanStatus',
      header: 'Loan Status',
      sortable: true,
      sortType: 'text',
      sortAccessor: (row) => row.loanStatus ?? '',
      render: (row) => {
        if (row.loanStatus === 'TAKEN') {
          return <Badge variant="danger">Loan Active (Hold)</Badge>;
        }
        if (row.loanStatus === 'CLEARED') {
          return <Badge variant="success">Loan Cleared</Badge>;
        }
        if (row.loanStatus === 'NOT_TAKEN') {
          return <Badge variant="neutral">Pledged</Badge>;
        }
        return <Badge variant="neutral">—</Badge>;
      },
    },
    {
      key: 'status',
      header: 'GRN Status',
      sortable: true,
      sortType: 'text',
      sortAccessor: (row) => row.status,
      render: (row) => {
        if (row.mergedIntoGrnNumber) {
          return <Badge variant="neutral">Merged → {row.mergedIntoGrnNumber}</Badge>;
        }
        return (
          <Badge variant={row.status === 'CLOSED' ? 'neutral' : 'warning'}>{row.status}</Badge>
        );
      },
    },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right',
      render: (row) => (
        <Button
          variant="secondary"
          size="sm"
          onClick={(e) => {
            e.stopPropagation();
            onOpenDetail(row);
          }}
          title={`View Bond Details for ${row.bondNumber ? `Bond ${row.bondNumber}` : row.grnNumber}`}
          aria-label={`View Bond Details for ${row.bondNumber ? `Bond ${row.bondNumber}` : row.grnNumber}`}
          leftIcon={<Eye size={14} aria-hidden="true" />}
        >
          View
        </Button>
      ),
    },
  ];
}
