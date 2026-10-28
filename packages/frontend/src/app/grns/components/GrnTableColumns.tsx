import type { Grn } from '@cold-storage/contracts';
import type { DataTableColumn } from '@/components/ui/DataTable';
import { Badge } from '@/components/ui';
import { formatDisplayDate } from '@/lib/date-format';
import { getLoanStatusDisplay } from '@/lib/loanStatusFormat';
import { extractMergedDate } from './grnMergedDate.helper';
import { parseMergedSourceGrns, parseMergedAddedBags } from '@/app/deliveries/hooks/eligibleGrn.helper';
import { GrnLifecycleStatusCell } from './GrnLifecycleStatusCell';
import { GrnRowActions } from './GrnRowActions';
import { RentTermsCell } from './RentTermsCell';
import styles from './GrnTable.module.css';

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
  onSortGrn?: (grn: Grn) => void;
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
  onSortGrn,
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
      render: (row) => {
        const isMergedSource = Boolean(row.mergedIntoGrnNumber || row.mergedIntoGrnId);
        const isMergedTarget = Boolean(row.remarks && row.remarks.includes('[MERGE RECEIVED'));
        const mergedSources = isMergedTarget ? parseMergedSourceGrns(row.remarks) : null;
        return (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span className={styles.grnLink}>{row.grnNumber}</span>
            {isMergedSource && row.mergedIntoGrnNumber && (
              <span className={styles.mergedReference} style={{ color: 'var(--color-primary-text)' }}>
                Merged into #{row.mergedIntoGrnNumber}
              </span>
            )}
            {isMergedTarget && (
              <span className={styles.mergedReference}>
                Merged Consignment{mergedSources ? ` (${mergedSources})` : ''}
              </span>
            )}
          </div>
        );
      },
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
      render: (row) => {
        const addedBags = parseMergedAddedBags(row.remarks);
        const hasMergedBreakdown = addedBags != null && addedBags > 0;
        const genesisBags = hasMergedBreakdown ? Math.max(0, row.bags - addedBags) : null;

        return (
          <div className={styles.bagsCell}>
            <span className={styles.inwardLink}>{row.bags.toLocaleString('en-IN')} bags</span>
            {hasMergedBreakdown && genesisBags != null && (
              <span className={styles.bagTypeSub} style={{ fontWeight: 'var(--font-medium)' }}>
                {genesisBags} Genesis + {addedBags} Merged
              </span>
            )}
            {row.isCompositionVerified && row.smallBags != null && row.bigBags != null && (row.smallBags > 0 || row.bigBags > 0) && (
              <span className={styles.bagTypeSub}>
                S: {row.smallBags.toLocaleString('en-IN')} • B: {row.bigBags.toLocaleString('en-IN')}
              </span>
            )}
            {row.netDeliveredBags != null && row.netDeliveredBags > 0 && (
              <span className={styles.deliveredSub}>
                Out: {row.netDeliveredBags.toLocaleString('en-IN')}
              </span>
            )}
          </div>
        );
      },
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
          onSortGrn={onSortGrn}
          onPrint={onPrint}
        />
      ),
    },
  ];
}
