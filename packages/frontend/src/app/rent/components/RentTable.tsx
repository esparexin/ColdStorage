'use client';

import React from 'react';
import { CheckCircle2, Clock, Eye, Plus } from 'lucide-react';
import type { RentSummaryDto } from '@cold-storage/contracts';
import { DataTable, type DataTableColumn } from '@/components/ui/DataTable';
import { Badge, Button } from '@/components/ui';
import styles from '../page.module.css';

interface RentTableProps {
  accounts: RentSummaryDto[];
  facilityName: string;
  canCollect: boolean;
  onOpenCollect: (acc: RentSummaryDto) => void;
  onOpenHistory: (acc: RentSummaryDto) => void;
}

export function RentTable({
  accounts,
  facilityName,
  canCollect,
  onOpenCollect,
  onOpenHistory,
}: RentTableProps) {
  const columns: DataTableColumn<RentSummaryDto>[] = [
    {
      key: 'grnNumber',
      header: 'GRN # / Date',
      render: (row) => (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <span style={{ fontWeight: 600 }}>{row.grnNumber}</span>
          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
            {new Date(row.inwardDate).toLocaleDateString('en-IN', {
              day: '2-digit',
              month: 'short',
              year: 'numeric',
            })}
          </span>
        </div>
      ),
    },
    {
      key: 'customer',
      header: 'Customer',
      render: (row) => <span>{row.customerName}</span>,
    },
    {
      key: 'commodity',
      header: 'Commodity & Chamber',
      render: (row) => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
          <span>{row.commodityName}</span>
          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
            Chamber {row.chamber} ({row.totalBags} bags)
          </span>
        </div>
      ),
    },
    {
      key: 'structure',
      header: 'Rent Structure',
      render: (row) => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
          <span>
            {row.rentType}
            {row.rentType === 'Monthly' && row.rentMonths ? ` (${row.rentMonths}m)` : ''}
          </span>
          <span style={{ fontSize: 'var(--text-xs)', fontWeight: 600 }}>
            ₹{row.rentAmount.toLocaleString('en-IN')}
          </span>
        </div>
      ),
    },
    {
      key: 'accounting',
      header: 'Paid / Balance',
      align: 'right',
      render: (row) => (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '2px' }}>
          <span style={{ fontWeight: 600, color: 'var(--color-success)' }}>
            Paid: ₹{row.totalPaid.toLocaleString('en-IN')}
          </span>
          <span
            style={{
              fontSize: 'var(--text-xs)',
              fontWeight: 600,
              color: row.remainingBalance > 0 ? 'var(--color-warning)' : 'var(--color-text-muted)',
            }}
          >
            Due: ₹{row.remainingBalance.toLocaleString('en-IN')}
          </span>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      align: 'center',
      render: (row) => (
        <Badge
          variant={row.paymentStatus === 'Settled' ? 'success' : 'warning'}
          icon={
            row.paymentStatus === 'Settled' ? (
              <CheckCircle2 size={12} aria-hidden="true" />
            ) : (
              <Clock size={12} aria-hidden="true" />
            )
          }
        >
          {row.paymentStatus === 'Settled' ? 'Settled' : 'Not Settled'}
        </Badge>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right',
      render: (row) => (
        <div className={styles.actionGroup}>
          {row.paymentStatus !== 'Settled' && canCollect && (
            <Button
              variant="primary"
              size="sm"
              onClick={() => onOpenCollect(row)}
              title="Collect rent payment"
              leftIcon={<Plus size={13} aria-hidden="true" />}
            >
              Collect
            </Button>
          )}

          <Button
            variant="outline"
            size="sm"
            onClick={() => onOpenHistory(row)}
            title="View payment cash memos history"
            leftIcon={<Eye size={13} aria-hidden="true" />}
          >
            Cash Memos ({row.payments.length})
          </Button>
        </div>
      ),
    },
  ];

  return (
    <DataTable
      columns={columns}
      rows={accounts}
      rowKey={(r) => r.grnId}
      caption={`Rent Accounts for ${facilityName}`}
    />
  );
}
