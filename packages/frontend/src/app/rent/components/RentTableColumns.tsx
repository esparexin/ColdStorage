import React from 'react';
import { CheckCircle2, Clock, Eye, Plus } from 'lucide-react';
import type { RentDeliveryBill, RentSummaryDto } from '@cold-storage/contracts';
import type { DataTableColumn } from '@/components/ui/DataTable';
import { Badge, Button } from '@/components/ui';
import { formatDisplayDate } from '@/lib/date-format';
import {
  formatRentStructure,
  formatAgreedRates,
  parseOwnershipTransferDisplayInfo,
} from '../hooks/rentDisplay.helper';
import type { RentBillTableRow } from '../hooks/rentTableRows.helper';
import styles from '../page.module.css';

export interface CreateRentColumnsParams {
  canCollect: boolean;
  onOpenCollect: (acc: RentSummaryDto, del?: RentDeliveryBill | null) => void;
  onOpenHistory: (acc: RentSummaryDto) => void;
}

export function createRentColumns({
  canCollect,
  onOpenCollect,
  onOpenHistory,
}: CreateRentColumnsParams): DataTableColumn<RentBillTableRow>[] {
  return [
    {
      key: 'customer',
      header: 'Customer',
      sortable: true,
      sortType: 'text',
      sortAccessor: (row) => row.customerName,
      render: (row) => {
        const transferInfo = parseOwnershipTransferDisplayInfo(row.remarks);
        return (
          <div className={styles.tableCustomer}>
            <span className={styles.tableCustomerName}>{row.customerName}</span>
            {transferInfo?.isTransferred && (
              <span
                style={{
                  fontSize: 'var(--text-xs)',
                  color: transferInfo.hasCarriedDebt
                    ? 'var(--color-warning-text)'
                    : 'var(--color-text-secondary)',
                  fontWeight: 'var(--font-medium)',
                }}
                title={
                  transferInfo.fromParty
                    ? `Transferred from ${transferInfo.fromParty}`
                    : 'Transferred ownership'
                }
              >
                👤 Transferred {transferInfo.fromParty ? `(from ${transferInfo.fromParty})` : ''}
              </span>
            )}
          </div>
        );
      },
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
            {row.challanNumber && (
              <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-primary-text)', fontWeight: 'var(--font-medium)' }}>
                {`GP: ${row.challanNumber}${row.gpNumber ? ` (${row.gpNumber})` : ''}`}
              </span>
            )}
            {isMergedSource && row.mergedIntoGrnNumber && (
              <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-primary-text)', fontWeight: 'var(--font-medium)' }}>
                Merged into #{row.mergedIntoGrnNumber}
              </span>
            )}
            {isMergedTarget && !row.challanNumber && (
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
        const agreedRates = formatAgreedRates(row.account);
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-0-5)' }}>
            <span style={{ fontSize: 'var(--text-xs)' }}>
              {row.rentType}
              {row.rentType === 'Monthly' && row.account.rentMonths ? ` (${row.account.rentMonths}m)` : ''}
            </span>
            <span style={{ fontSize: 'var(--text-xs)', fontWeight: 'var(--font-semibold)' }}>
              {row.challanNumber ? `₹${row.totalDue.toLocaleString('en-IN')}` : formatRentStructure(row.account)}
            </span>
            {row.challanNumber ? (
              <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', fontVariantNumeric: 'tabular-nums' }}>
                {`${row.totalBags} bags (${row.smallBags ?? 0} Small / ${row.bigBags ?? 0} Big)`}
              </span>
            ) : agreedRates ? (
              <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', fontVariantNumeric: 'tabular-nums' }}>
                {agreedRates}
              </span>
            ) : null}
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
        row.date ? new Date(row.date).getTime() : 0,
      render: (row) => (
        <span className={styles.tableSubtext}>
          {formatDisplayDate(row.date, { fallback: '—' })}
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
        return (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 'var(--space-0-5)' }}>
            <span style={{ fontSize: 'var(--text-xs)', fontWeight: 'var(--font-semibold)', color: 'var(--color-success-text)' }}>
              Paid: ₹{row.totalPaid.toLocaleString('en-IN')}
            </span>
            <span style={{ fontSize: 'var(--text-xs)', fontWeight: 'var(--font-semibold)', color: row.remainingBalance > 0 ? 'var(--color-warning-text)' : 'var(--color-text-muted)' }}>
              Due: ₹{row.remainingBalance.toLocaleString('en-IN')}
            </span>
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
      sortAccessor: (row) => row.paymentStatus,
      render: (row) => {
        const isSettled = row.remainingBalance === 0 && row.totalPaid > 0;
        const isPartial = row.remainingBalance > 0 && row.totalPaid > 0;
        const label = isSettled ? 'Settled' : isPartial ? 'Partially Paid' : 'Pending';
        const variant = isSettled ? 'success' : isPartial ? 'warning' : 'neutral';
        const Icon = isSettled ? CheckCircle2 : Clock;
        return (
          <Badge variant={variant} icon={<Icon size={12} aria-hidden="true" />}>
            {label}
          </Badge>
        );
      },
    },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right',
      render: (row) => {
        const isSettled = row.remainingBalance === 0 && row.totalPaid > 0;
        return (
          <div className={styles.actionGroup}>
            {!isSettled && canCollect && (
              <Button
                variant="primary"
                size="sm"
                onClick={() => onOpenCollect(row.account, row.deliveryBill)}
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
              onClick={() => onOpenHistory(row.account)}
              title="View payment cash memos history"
              aria-label={`View cash memos history for ${row.grnNumber}`}
              leftIcon={<Eye size={12} aria-hidden="true" />}
            >
              Cash Memos ({row.account.payments.length})
            </Button>
          </div>
        );
      },
    },
  ];
}
