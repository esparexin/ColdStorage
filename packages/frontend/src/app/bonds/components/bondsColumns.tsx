import React from 'react';
import { Eye } from 'lucide-react';
import type { Grn } from '@cold-storage/contracts';
import type { DataTableColumn } from '@/components/ui/DataTable';
import { Badge, Button } from '@/components/ui';

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
      render: (row) => (
        <span style={{ fontWeight: 'var(--font-semibold)' }}>{row.customerName}</span>
      ),
    },
    {
      key: 'grnNumber',
      header: 'GRN',
      render: (row) => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-0-5)' }}>
          <span style={{ fontWeight: 'var(--font-medium)', whiteSpace: 'nowrap' }}>{row.grnNumber}</span>
          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
            {new Date(row.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
          </span>
        </div>
      ),
    },
    {
      key: 'commodityName',
      header: 'Commodity',
      render: (row) => row.commodityName,
    },
    {
      key: 'bondNumber',
      header: 'Bond #',
      render: (row) => (
        // Bond # resolves to the GR Number: it is not a separately stored identifier.
        <span style={{ fontWeight: 'var(--font-semibold)', color: 'var(--color-primary-text)' }}>
          {row.grnNumber}
        </span>
      ),
    },
    {
      key: 'loanStatus',
      header: 'Loan Status',
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
      render: (row) => (
        <Badge variant={row.status === 'CLOSED' ? 'neutral' : 'warning'}>
          {row.status}
        </Badge>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right',
      render: (row) => (
        <Button
          variant="secondary"
          size="sm"
          onClick={() => onOpenDetail(row)}
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
