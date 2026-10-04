'use client';

import React from 'react';
import {
  CheckCircle2,
  Clock,
  Eye,
  FileText,
  Printer,
} from 'lucide-react';
import type { Grn } from '@cold-storage/contracts';
import { DataTable, type DataTableColumn } from '@/components/ui/DataTable';
import { Badge, Button } from '@/components/ui';
import styles from '../page.module.css';

interface GrnTableProps {
  grns: Grn[];
  caption: string;
  canPrint: boolean;
  printingId: string | null;
  page: number;
  pageSize: number;
  totalPages: number;
  totalGrns: number;
  onPageChange: (page: number) => void;
  onSelectGrn: (grn: Grn) => void;
  onPrint: (type: 'grn' | 'receipt', grnId: string) => void;
}

export function GrnTable({
  grns,
  caption,
  canPrint,
  printingId,
  page,
  pageSize,
  totalPages,
  totalGrns,
  onPageChange,
  onSelectGrn,
  onPrint,
}: GrnTableProps) {
  const columns: DataTableColumn<Grn>[] = [
    {
      key: 'grnNumber',
      header: 'GRN / Receipt #',
      render: (row) => (
        <div className={styles.grnCell}>
          <span className={styles.grnNumber}>{row.grnNumber}</span>
          <span className={styles.receiptNumber}>Receipt: {row.inwardReceiptNumber}</span>
          <span className={styles.dateSub}>
            {new Date(row.date).toLocaleDateString('en-IN', {
              day: '2-digit',
              month: 'short',
              year: 'numeric',
            })}
          </span>
        </div>
      ),
    },
    {
      key: 'customerName',
      header: 'Customer',
      render: (row) => <span>{row.customerName}</span>,
    },
    {
      key: 'commodityName',
      header: 'Commodity & Chamber',
      render: (row) => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <span>{row.commodityName}</span>
          <span className={styles.tagChamber}>Chamber {row.chamber}</span>
        </div>
      ),
    },
    {
      key: 'bags',
      header: 'Bags & Closing',
      align: 'right',
      render: (row) => {
        const closing = row.closingBags ?? 0;
        return (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '2px' }}>
            <span style={{ fontWeight: 'var(--font-semibold)' }}>{row.bags.toLocaleString('en-IN')} in</span>
            {row.netDeliveredBags != null && row.netDeliveredBags > 0 && (
              <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)' }}>
                Del: {row.netDeliveredBags.toLocaleString('en-IN')}
              </span>
            )}
            <span style={{ fontSize: 'var(--text-xs)', fontWeight: 'var(--font-semibold)', color: closing === 0 ? 'var(--color-text-muted)' : 'var(--color-primary)' }}>
              Bal: {closing.toLocaleString('en-IN')}
            </span>
          </div>
        );
      },
    },
    {
      key: 'rent',
      header: 'Rent Terms',
      render: (row) => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
          <span>
            {row.rentType}
            {row.rentType === 'Monthly' && row.rentMonths ? ` (${row.rentMonths}m)` : ''}
          </span>
          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
            ₹{row.rentAmount.toLocaleString('en-IN')}
          </span>
        </div>
      ),
    },
    {
      key: 'identifiers',
      header: 'GP / Vehicle',
      render: (row) => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', fontSize: 'var(--text-xs)' }}>
          <span>GP: {row.gpNumber || '—'}</span>
          <span>Veh: {row.vehicleNumber || '—'}</span>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      align: 'center',
      render: (row) => (
        <Badge
          variant={row.status === 'OPEN' ? 'warning' : 'neutral'}
          icon={
            row.status === 'OPEN' ? (
              <Clock size={12} aria-hidden="true" />
            ) : (
              <CheckCircle2 size={12} aria-hidden="true" />
            )
          }
        >
          {row.status}
        </Badge>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right',
      render: (row) => (
        <div className={styles.actionGroup}>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onSelectGrn(row)}
            title="View Details"
            leftIcon={<Eye size={13} aria-hidden="true" />}
          >
            View
          </Button>

          {canPrint && (
            <>
              <Button
                variant="primary"
                size="sm"
                onClick={() => onPrint('grn', row.id)}
                disabled={printingId === `grn-${row.id}`}
                isLoading={printingId === `grn-${row.id}`}
                title="Print Official GRN"
                leftIcon={<Printer size={13} aria-hidden="true" />}
              >
                GRN
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => onPrint('receipt', row.id)}
                disabled={printingId === `receipt-${row.id}`}
                isLoading={printingId === `receipt-${row.id}`}
                title="Print Farmer Inward Receipt"
                leftIcon={<FileText size={13} aria-hidden="true" />}
              >
                Ack
              </Button>
            </>
          )}
        </div>
      ),
    },
  ];

  return (
    <DataTable
      columns={columns}
      rows={grns}
      rowKey={(r) => r.id}
      caption={caption}
      pagination={{ page, pageSize, totalPages, totalRecords: totalGrns, onPageChange }}
    />
  );
}
