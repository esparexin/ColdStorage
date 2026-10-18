'use client';

import type { Grn } from '@cold-storage/contracts';
import { DataTable, type DataTableColumn } from '@/components/ui/DataTable';
import { Badge } from '@/components/ui';
import { formatDisplayDate } from '@/lib/date-format';
import { getLoanStatusDisplay } from '@/lib/loanStatusFormat';
import { extractMergedDate } from './grnMergedDate.helper';
import { GrnLifecycleStatusCell } from './GrnLifecycleStatusCell';
import { GrnRowActions } from './GrnRowActions';
import { RentTermsCell } from './RentTermsCell';
import styles from './GrnTable.module.css';

interface GrnTableProps {
  grns: Grn[];
  caption: string;
  isMergedTab?: boolean;
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
  isMergedTab?: boolean;
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
  isMergedTab = false,
  canPrint,
  canCorrect = false,
  canCreateChallan = false,
  canInternalMove = false,
  printingId,
  onSelectGrn,
  onCorrectGrn,
  onCreateChallan,
  onInternalMove,
  onPrint,
}: CreateGrnTableColumnsParams): DataTableColumn<Grn>[] {
  return [
    {
      key: 'date',
      header: 'Inward Date',
      sortable: true,
      sortType: 'date',
      sortAccessor: (row) => row.date,
      render: (row) => <span className={styles.dateCell}>{formatDisplayDate(row.date)}</span>,
    },
    {
      key: 'grnNumber',
      header: 'GRN #',
      sortable: true,
      sortType: 'text',
      sortAccessor: (row) => row.grnNumber,
      render: (row) => <span className={styles.grnLink}>{row.grnNumber}</span>,
    },
    {
      key: 'customerName',
      header: 'Customer',
      sortable: true,
      sortType: 'text',
      sortAccessor: (row) => row.customerName,
      render: (row) => <span className={styles.customerCell}>{row.customerName}</span>,
    },
    {
      key: 'commodityName',
      header: 'Commodity',
      sortable: true,
      sortType: 'text',
      sortAccessor: (row) => row.commodityName,
      render: (row) => <span className={styles.commodityName}>{row.commodityName}</span>,
    },
    {
      key: 'bags',
      header: 'Inward Bags',
      align: 'right',
      sortable: true,
      sortType: 'number',
      sortAccessor: (row) => row.bags,
      render: (row) => (
        <div className={styles.bagsCell}>
          <span className={styles.inwardLink}>{row.bags.toLocaleString('en-IN')} bags</span>
          {row.bagType && <span className={styles.bagTypeSub}>S/B: {row.bagType}</span>}
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
      sortable: true,
      sortType: 'number',
      sortAccessor: (row) => row.closingBags ?? 0,
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
        const { badgeLabel, variant } = getLoanStatusDisplay(row.loanStatus);
        return badgeLabel === '—' ? (
          <span style={{ color: 'var(--color-text-muted)', fontSize: 'var(--text-xs)' }}>—</span>
        ) : (
          <Badge variant={variant}>{badgeLabel}</Badge>
        );
      },
    },
    {
      key: 'status',
      header: 'Status',
      align: 'center',
      render: (row) => <GrnLifecycleStatusCell row={row} />,
    },
    ...(isMergedTab
      ? [
          {
            key: 'mergedDate',
            header: 'Merged Date',
            align: 'center' as const,
            sortable: true,
            sortType: 'date' as const,
            sortAccessor: (row: Grn) => extractMergedDate(row.remarks),
            render: (row: Grn) => {
              const d = extractMergedDate(row.remarks);
              return <span className={styles.dateCell}>{formatDisplayDate(d)}</span>;
            },
          },
        ]
      : []),
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
  grns,
  caption,
  isMergedTab = false,
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
  const columns = createGrnTableColumns({
    isMergedTab,
    canPrint,
    canCorrect,
    canCreateChallan,
    canInternalMove,
    printingId,
    onSelectGrn,
    onCorrectGrn,
    onCreateChallan,
    onInternalMove,
    onPrint,
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
