'use client';

import { Clock, X } from 'lucide-react';
import type { Grn } from '@cold-storage/contracts';
import { DataTable, type DataTableColumn } from '@/components/ui/DataTable';
import { Badge, Button } from '@/components/ui';
import { GrnRowActions } from './GrnRowActions';
import { RentTermsCell } from './RentTermsCell';
import styles from './GrnTable.module.css';

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

export interface CreateGrnTableColumnsParams {
  canPrint: boolean;
  canCorrect?: boolean;
  canCreateChallan?: boolean;
  canInternalMove?: boolean;
  printingId: string | null;
  onSelectGrn: (grn: Grn) => void;
  onCorrectGrn?: (grn: Grn) => void;
  onCreateChallan?: (grn: Grn) => void;
  onInternalMove?: (grn: Grn) => void;
  onPrint: (type: 'grn' | 'receipt', grnId: string) => void;
}

export function createGrnTableColumns({
  canPrint, canCorrect = false, canCreateChallan = false, canInternalMove = false,
  printingId, onSelectGrn, onCorrectGrn, onCreateChallan, onInternalMove, onPrint,
}: CreateGrnTableColumnsParams): DataTableColumn<Grn>[] {
  return [
    {
      key: 'date',
      header: 'Date',
      render: (row) => (
        <span className={styles.dateCell}>
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
        <Button
          variant="ghost"
          size="sm"
          className={styles.grnLink}
          onClick={() => onSelectGrn(row)}
          aria-label={`View details for GRN ${row.grnNumber}`}
        >
          {row.grnNumber}
        </Button>
      ),
    },
    {
      key: 'customerName',
      header: 'Customer',
      render: (row) => (
        <span className={styles.customerCell}>
          {row.customerName}
        </span>
      ),
    },
    {
      key: 'commodityName',
      header: 'Commodity',
      render: (row) => (
        <span className={styles.commodityName}>{row.commodityName}</span>
      ),
    },
    {
      key: 'bags',
      header: 'Inward Bags',
      align: 'right',
      render: (row) => (
        <div className={styles.bagsCell}>
          <Button
            variant="ghost"
            size="sm"
            className={styles.inwardLink}
            onClick={() => onSelectGrn(row)}
            aria-label={`View details for GRN ${row.grnNumber}`}
          >
            {row.bags.toLocaleString('en-IN')} bags
          </Button>
          {row.bagType && (
            <span className={styles.bagTypeSub}>
              S/B: {row.bagType}
            </span>
          )}
          {row.netDeliveredBags != null && row.netDeliveredBags > 0 && (
            <span className={styles.deliveredSub}>
              Out: {row.netDeliveredBags.toLocaleString('en-IN')}
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
          <span
            className={styles.balanceCell}
            style={{
              color: closing === 0 ? 'var(--color-text-muted)' : 'var(--color-text-primary)',
            }}
          >
            {closing.toLocaleString('en-IN')} bags
          </span>
        );
      },
    },
    {
      key: 'rent',
      header: 'Rent Terms',
      render: (row) => <RentTermsCell row={row} />,
    },
    {
      key: 'loanStatus',
      header: 'Loan Status',
      align: 'center',
      render: (row) => {
        if (row.loanStatus === 'CLEARED') {
          return <Badge variant="success">Loan Cleared</Badge>;
        }
        if (row.loanStatus === 'TAKEN') {
          return <Badge variant="danger">Loan Hold</Badge>;
        }
        if (row.loanStatus === 'NOT_TAKEN') {
          return <Badge variant="neutral">Pledged</Badge>;
        }
        return <span style={{ color: 'var(--color-text-muted)', fontSize: 'var(--text-xs)' }}>—</span>;
      },
    },
    {
      key: 'status',
      header: 'Status',
      align: 'center',
      render: (row) => (
        <div className={styles.statusGroup}>
          <Badge
            variant={row.status === 'OPEN' ? 'warning' : 'neutral'}
            icon={row.status === 'OPEN' ? <Clock size={11} aria-hidden="true" /> : <X size={11} aria-hidden="true" />}
          >
            {row.status === 'OPEN' ? 'Open' : 'Closed'}
          </Badge>
          {row.mergedIntoGrnNumber && (
            <span className={styles.mergedReference}>
              Merged → {row.mergedIntoGrnNumber}
            </span>
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
}

export function GrnTable({
  grns, caption, canPrint, canCorrect = false, canCreateChallan = false,
  canInternalMove = false, printingId, page, pageSize, totalPages, totalGrns,
  onPageChange, onSelectGrn, onCorrectGrn, onCreateChallan, onInternalMove, onPrint,
}: GrnTableProps) {
  const columns = createGrnTableColumns({
    canPrint, canCorrect, canCreateChallan, canInternalMove,
    printingId, onSelectGrn, onCorrectGrn, onCreateChallan, onInternalMove, onPrint,
  });

  return (
    <DataTable
      columns={columns}
      rows={grns}
      rowKey={(r) => r.id}
      caption={caption}
      pagination={{ page, pageSize, totalPages, totalRecords: totalGrns, onPageChange }}
      onRowClick={onSelectGrn}
    />
  );
}
