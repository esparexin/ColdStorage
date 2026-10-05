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
  page: number;
  pageSize: number;
  totalPages: number;
  totalAccounts: number;
  onPageChange: (page: number) => void;
  onOpenCollect: (acc: RentSummaryDto) => void;
  onOpenHistory: (acc: RentSummaryDto) => void;
}

export function RentTable({
  accounts,
  facilityName: _facilityName,
  canCollect,
  page,
  pageSize,
  totalPages,
  totalAccounts,
  onPageChange,
  onOpenCollect,
  onOpenHistory,
}: RentTableProps) {
  const columns: DataTableColumn<RentSummaryDto>[] = [
    {
      key: 'customer',
      header: 'Customer',
      render: (row) => (
        <div className={styles.tableCustomer}>
          <span className={styles.tableCustomerName}>{row.customerName}</span>
        </div>
      ),
    },
    {
      key: 'grnNumber',
      header: 'GRN # / Date',
      render: (row) => (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <span className={styles.tableMono}>{row.grnNumber}</span>
          <span className={styles.tableSubtext}>
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
      key: 'commodity',
      header: 'Commodity & Chamber',
      render: (row) => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
          <span style={{ fontSize: 'var(--text-xs)', fontWeight: 'var(--font-medium)' }}>
            {row.commodityName}
          </span>
          <span className={styles.tableSubtext}>
            Chamber {row.chamber}
          </span>
        </div>
      ),
    },
    {
      key: 'inwardBags',
      header: 'Inward',
      align: 'right',
      render: (row) => (
        <span className={styles.bagNumber}>{row.totalBags.toLocaleString('en-IN')}</span>
      ),
    },
    {
      key: 'outwardBags',
      header: 'Outward',
      align: 'right',
      render: (row) => (
        <span className={styles.bagNumber}>
          {(row.deliveredBags ?? 0).toLocaleString('en-IN')}
        </span>
      ),
    },
    {
      key: 'remainingBags',
      header: 'Balance',
      align: 'right',
      render: (row) => {
        const bal =
          row.remainingBags ?? Math.max(0, row.totalBags - (row.deliveredBags ?? 0));
        return (
          <span
            className={`${styles.bagNumber} ${bal > 0 ? styles.balancePositive : styles.balanceZero}`}
          >
            {bal.toLocaleString('en-IN')}
          </span>
        );
      },
    },
    {
      key: 'structure',
      header: 'Rent Structure',
      render: (row) => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
          <span style={{ fontSize: 'var(--text-xs)' }}>
            {row.rentType}
            {row.rentType === 'Monthly' && row.rentMonths ? ` (${row.rentMonths}m)` : ''}
          </span>
          <span style={{ fontSize: 'var(--text-xs)', fontWeight: 'var(--font-semibold)' }}>
            ₹{row.rentAmount.toLocaleString('en-IN')}
          </span>
        </div>
      ),
    },
    {
      key: 'accounting',
      header: 'Paid / Due',
      align: 'right',
      render: (row) => (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '2px' }}>
          <span
            style={{
              fontSize: 'var(--text-xs)',
              fontWeight: 'var(--font-semibold)',
              color: 'var(--color-success)',
            }}
          >
            Paid: ₹{row.totalPaid.toLocaleString('en-IN')}
          </span>
          <span
            style={{
              fontSize: 'var(--text-xs)',
              fontWeight: 'var(--font-semibold)',
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
              leftIcon={<Plus size={12} aria-hidden="true" />}
            >
              Collect
            </Button>
          )}

          <Button
            variant="outline"
            size="sm"
            onClick={() => onOpenHistory(row)}
            title="View payment cash memos history"
            leftIcon={<Eye size={12} aria-hidden="true" />}
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
      pagination={{ page, pageSize, totalPages, totalRecords: totalAccounts, onPageChange }}
    />
  );
}
