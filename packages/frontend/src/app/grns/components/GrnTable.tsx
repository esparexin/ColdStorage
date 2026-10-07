'use client';

import React from 'react';
import {
  CheckCircle2,
  Clock,
} from 'lucide-react';
import type { Grn } from '@cold-storage/contracts';
import { DataTable, type DataTableColumn } from '@/components/ui/DataTable';
import { Badge } from '@/components/ui';
import { GrnRowActions } from './GrnRowActions';
import { RentTermsCell } from './RentTermsCell';
import styles from '../page.module.css';

interface GrnTableProps {
  grns: Grn[];
  caption: string;
  canPrint: boolean;
  canCorrect?: boolean;
  canCreateChallan?: boolean;
  canInternalMove?: boolean;
  printingId: string | null;
  page: number;
  pageSize: number;
  totalPages: number;
  totalGrns: number;
  onPageChange: (page: number) => void;
  onSelectGrn: (grn: Grn) => void;
  onCorrectGrn?: (grn: Grn) => void;
  onCreateChallan?: (grn: Grn) => void;
  onInternalMove?: (grn: Grn) => void;
  onPrint: (type: 'grn' | 'receipt', grnId: string) => void;
}

export function GrnTable({
  grns,
  caption,
  canPrint,
  canCorrect = false,
  canCreateChallan = false,
  canInternalMove = false,
  printingId,
  page,
  pageSize,
  totalPages,
  totalGrns,
  onPageChange,
  onSelectGrn,
  onCorrectGrn,
  onCreateChallan,
  onInternalMove,
  onPrint,
}: GrnTableProps) {
  const columns: DataTableColumn<Grn>[] = [
    {
      key: 'date',
      header: 'Date',
      render: (row) => (
        <span style={{ fontSize: 'var(--text-xs)', whiteSpace: 'nowrap', fontWeight: 'var(--font-medium)' }}>
          {new Date(row.date).toLocaleDateString('en-IN', {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
          })}
        </span>
      ),
    },
    {
      key: 'grnNumber',
      header: 'GRN #',
      render: (row) => (
        <span className={styles.grnNumber} style={{ fontSize: 'var(--text-xs)' }}>
          {row.grnNumber}
        </span>
      ),
    },
    {
      key: 'customerName',
      header: 'Customer',
      render: (row) => (
        <span style={{ fontSize: 'var(--text-xs)', fontWeight: 'var(--font-medium)' }}>
          {row.customerName}
        </span>
      ),
    },
    {
      key: 'commodityName',
      header: 'Commodity & Chamber',
      render: (row) => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-0-5)', fontSize: 'var(--text-xs)' }}>
          <span>{row.commodityName}</span>
          <span className={styles.tagChamber}>{row.chamber}</span>
        </div>
      ),
    },
    {
      key: 'bags',
      header: 'Bags',
      align: 'right',
      render: (row) => (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 'var(--space-0-5)', fontSize: 'var(--text-xs)' }}>
          <span style={{ fontWeight: 'var(--font-semibold)' }}>{row.bags.toLocaleString('en-IN')} in</span>
          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
            S/B: {row.bagType ?? 'S/B'}
          </span>
          {row.netDeliveredBags != null && row.netDeliveredBags > 0 && (
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)' }}>
              Del: {row.netDeliveredBags.toLocaleString('en-IN')}
            </span>
          )}
        </div>
      ),
    },
    {
      key: 'balance',
      header: 'Balance',
      align: 'right',
      render: (row) => {
        const closing = row.closingBags ?? 0;
        return (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 'var(--space-0-5)', fontSize: 'var(--text-xs)' }}>
            <span
              style={{
                fontWeight: 'var(--font-bold)',
                color: closing === 0 ? 'var(--color-text-muted)' : 'var(--color-primary-text)',
              }}
            >
              {closing.toLocaleString('en-IN')}
            </span>
            {closing === 0 && (
              <span
                style={{
                  fontSize: 'var(--text-xs)',
                  fontWeight: 'var(--font-bold)',
                  color: 'var(--color-text-muted)',
                  background: 'var(--color-surface-2)',
                  padding: '0 var(--space-1)',
                  borderRadius: 'var(--radius-sm)',
                }}
              >
                CLOSED
              </span>
            )}
          </div>
        );
      },
    },
    {
      key: 'rent',
      header: 'Rent Terms',
      render: (row) => <RentTermsCell row={row} />,
    },
    {
      key: 'vehicleNumber',
      header: 'Vehicle',
      render: (row) => (
        <span style={{ fontSize: 'var(--text-xs)' }}>
          {row.vehicleNumber || '—'}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      align: 'center',
      render: (row) => (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--space-1)' }}>
          <Badge
            variant={row.status === 'OPEN' ? 'warning' : 'neutral'}
            icon={row.status === 'OPEN' ? <Clock size={11} aria-hidden="true" /> : <CheckCircle2 size={11} aria-hidden="true" />}
          >
            {row.status}
          </Badge>
          {row.loanStatus === 'TAKEN' && (
            <Badge variant="danger">Loan Hold</Badge>
          )}
          {row.loanStatus === 'CLEARED' && (
            <Badge variant="success">Loan Cleared</Badge>
          )}
          {row.loanStatus === 'NOT_TAKEN' && (
            <Badge variant="neutral">Pledged</Badge>
          )}
        </div>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right',
      render: (row) => (
        <GrnRowActions
          row={row}
          canCorrect={canCorrect}
          canCreateChallan={canCreateChallan}
          canInternalMove={canInternalMove}
          canPrint={canPrint}
          printingId={printingId}
          onSelectGrn={onSelectGrn}
          onCorrectGrn={onCorrectGrn}
          onCreateChallan={onCreateChallan}
          onInternalMove={onInternalMove}
          onPrint={onPrint}
        />
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
