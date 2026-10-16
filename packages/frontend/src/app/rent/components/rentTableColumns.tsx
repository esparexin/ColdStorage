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
      render: (row) => (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <span className={styles.tableMono}>{row.grnNumber}</span>
          <span className={styles.tableSubtext}>{formatDisplayDate(row.inwardDate)}</span>
        </div>
      ),
    },
    {
      key: 'commodity',
      header: 'Commodity & Chamber',
      sortable: true,
      sortType: 'text',
      sortAccessor: (row) => row.commodityName,
      render: (row) => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-0-5)' }}>
          <span style={{ fontSize: 'var(--text-sm)', fontWeight: 'var(--font-medium)' }}>
            {row.commodityName}
          </span>
          <span className={styles.tableSubtext}>Chamber {row.chamber}</span>
        </div>
      ),
    },
    {
      key: 'inwardBags',
      header: 'Inward',
      align: 'right',
      sortable: true,
      sortType: 'number',
      sortAccessor: (row) => row.totalBags,
      render: (row) => (
        <span className={styles.bagNumber}>{row.totalBags.toLocaleString('en-IN')}</span>
      ),
    },
    {
      key: 'outwardBags',
      header: 'Outward',
      align: 'right',
      sortable: true,
      sortType: 'number',
      sortAccessor: (row) => row.deliveredBags ?? 0,
      render: (row) => (
        <span className={styles.bagNumber}>{(row.deliveredBags ?? 0).toLocaleString('en-IN')}</span>
      ),
    },
    {
      key: 'remainingBags',
      header: 'Balance',
      align: 'right',
      sortable: true,
      sortType: 'number',
      sortAccessor: (row) =>
        row.remainingBags ?? Math.max(0, row.totalBags - (row.deliveredBags ?? 0)),
      render: (row) => {
        const bal = row.remainingBags ?? Math.max(0, row.totalBags - (row.deliveredBags ?? 0));
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
              <span
                style={{
                  fontSize: 'var(--text-xs)',
                  color: 'var(--color-text-muted)',
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {agreedRates}
              </span>
            )}
          </div>
        );
      },
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
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'flex-end',
              gap: 'var(--space-0-5)',
            }}
          >
            <span
              style={{
                fontSize: 'var(--text-xs)',
                fontWeight: 'var(--font-semibold)',
                color: 'var(--color-success-text)',
              }}
            >
              Paid: ₹{row.totalPaid.toLocaleString('en-IN')}
            </span>
            <span
              style={{
                fontSize: 'var(--text-xs)',
                fontWeight: 'var(--font-semibold)',
                color:
                  row.remainingBalance > 0 ? 'var(--color-warning-text)' : 'var(--color-text-muted)',
              }}
            >
              Due: ₹{row.remainingBalance.toLocaleString('en-IN')}
            </span>
            {lastP && (
              <span className={styles.tableSubtext}>
                Paid: {formatDisplayDate(lastP.paymentDate)}
              </span>
            )}
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
        return (
          <Badge
            variant={status.variant}
            icon={
              status.variant === 'success' ? (
                <CheckCircle2 size={12} aria-hidden="true" />
              ) : (
                <Clock size={12} aria-hidden="true" />
              )
            }
          >
            {status.label}
          </Badge>
        );
      },
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
      ),
    },
  ];
}
