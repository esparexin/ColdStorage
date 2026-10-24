import React from 'react';
import { CheckCircle2, Clock, Eye, Plus } from 'lucide-react';
import type { RentSummaryDto } from '@cold-storage/contracts';
import type { DataTableColumn } from '@/components/ui/DataTable';
import { Badge, Button } from '@/components/ui';
import { formatDisplayDate } from '@/lib/date-format';
import {
  formatPaymentStatus,
  formatRentStructure,
  formatAgreedRates,
  formatRemainingDue,
} from '../hooks/rentDisplay.helper';
import styles from '../page.module.css';

export interface CreateRentColumnsParams {
  canCollect: boolean;
  onOpenCollect: (acc: RentSummaryDto) => void;
  onOpenHistory: (acc: RentSummaryDto) => void;
}

export function createRentColumns({
  canCollect,
  onOpenCollect,
  onOpenHistory,
}: CreateRentColumnsParams): DataTableColumn<RentSummaryDto>[] {
  return [
    {
      key: 'customer',
      header: 'Customer',
      sortable: true,
      sortType: 'text',
      sortAccessor: (row) => row.customerName,
      render: (row) => (
        <div className={styles.tableCustomer}>
          <span className={styles.tableCustomerName}>{row.customerName}</span>
        </div>
      ),
    },
    {
      key: 'grnNumber',
      header: 'GRN # / Inward',
      sortable: true,
      sortType: 'text',
      sortAccessor: (row) => row.grnNumber,
      render: (row) => {
        const isMergedSource = Boolean(row.mergedIntoGrnNumber || row.mergedIntoGrnId);
        const isMergedTarget = Boolean(row.mergedConsignment?.isMergedTarget ?? (row.remarks && row.remarks.includes('[MERGE RECEIVED')));
        return (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span className={styles.tableMono}>{row.grnNumber}</span>
            <span className={styles.tableSubtext}>{formatDisplayDate(row.inwardDate)}</span>
            {isMergedSource && row.mergedIntoGrnNumber && (
              <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-primary-text)', fontWeight: 'var(--font-medium)' }}>
                Merged into #{row.mergedIntoGrnNumber}
              </span>
            )}
            {isMergedTarget && (
              <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', fontWeight: 'var(--font-medium)' }}>
                Merged Consignment
              </span>
            )}
          </div>
        );
      },
    },

    {
      key: 'structure',
      header: 'Rent Structure',
      render: (row) => {
        const agreedRates = formatAgreedRates(row);
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-0-5)' }}>
            <span style={{ fontSize: 'var(--text-xs)' }}>
              {row.rentType}
              {row.rentType === 'Monthly' && row.rentMonths ? ` (${row.rentMonths}m)` : ''}
            </span>
            <span style={{ fontSize: 'var(--text-xs)', fontWeight: 'var(--font-semibold)' }}>
              {formatRentStructure(row)}
            </span>
            {agreedRates && (
              <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', fontVariantNumeric: 'tabular-nums' }}>
                {agreedRates}
              </span>
            )}
          </div>
        );
      },
    },
    {
      key: 'rentGeneratedDate',
      header: 'Rent Generated Date',
      sortable: true,
      sortType: 'date',
      sortAccessor: (row) =>
        row.rentGeneratedDate ? new Date(row.rentGeneratedDate).getTime() : 0,
      render: (row) => (
        <span className={styles.tableSubtext}>
          {formatDisplayDate(row.rentGeneratedDate, { fallback: '—' })}
        </span>
      ),
    },
    {
      key: 'accounting',
      header: 'Paid / Due',
      align: 'right',
      sortable: true,
      sortType: 'number',
      sortAccessor: (row) => row.remainingBalance,
      render: (row) => {
        const lastP = row.payments?.length ? row.payments[row.payments.length - 1] : null;
        return (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 'var(--space-0-5)' }}>
            <span style={{ fontSize: 'var(--text-xs)', fontWeight: 'var(--font-semibold)', color: 'var(--color-success-text)' }}>
              Paid: ₹{row.totalPaid.toLocaleString('en-IN')}
            </span>
            <span style={{ fontSize: 'var(--text-xs)', fontWeight: 'var(--font-semibold)', color: row.remainingBalance > 0 ? 'var(--color-warning-text)' : 'var(--color-text-muted)' }}>
              Due: {formatRemainingDue(row)}
            </span>
            {lastP && <span className={styles.tableSubtext}>Paid: {formatDisplayDate(lastP.paymentDate)}</span>}
          </div>
        );
      },
    },
    {
      key: 'status',
      header: 'Status',
      align: 'center',
      sortable: true,
      sortType: 'text',
      sortAccessor: (row) => formatPaymentStatus(row).label,
      render: (row) => {
        const status = formatPaymentStatus(row);
        const Icon = status.variant === 'success' ? CheckCircle2 : Clock;
        return (
          <Badge variant={status.variant} icon={<Icon size={12} aria-hidden="true" />}>
            {status.label}
          </Badge>
        );
      },
    },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right',
      render: (row) => {
        return (
          <div className={styles.actionGroup}>
            {row.paymentStatus !== 'Settled' && canCollect && (
              <Button
                variant="primary"
                size="sm"
                onClick={() => onOpenCollect(row)}
                title="Collect rent payment"
                aria-label={`Collect rent payment for ${row.grnNumber}`}
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
              aria-label={`View cash memos history for ${row.grnNumber}`}
              leftIcon={<Eye size={12} aria-hidden="true" />}
            >
              Cash Memos ({row.payments.length})
            </Button>
          </div>
        );
      },
    },
  ];
}
