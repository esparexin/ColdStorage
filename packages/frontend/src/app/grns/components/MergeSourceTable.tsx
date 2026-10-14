'use client';

import {
  isBagCompositionVerified,
  isHybridBagCategory,
  seasonYearForInwardDate,
  type Grn,
} from '@cold-storage/contracts';
import { Badge, DataTable } from '@/components/ui';
import { formatDisplayDate } from '@/lib/date-format';

interface MergeSourceTableProps {
  eligibleSources: Grn[];
  selectedSourceIds: string[];
  targetGrnDate: Date | string;
  submitting: boolean;
  onToggleSource: (id: string) => void;
}

export function MergeSourceTable({
  eligibleSources,
  selectedSourceIds,
  targetGrnDate,
  submitting,
  onToggleSource,
}: MergeSourceTableProps) {
  const targetSeason = seasonYearForInwardDate(targetGrnDate);

  return (
    <DataTable
      columns={[
        {
          key: 'select',
          header: 'Sel',
          render: (sg) => (
            <input
              id={`select-source-${sg.id}`}
              aria-label={`Select GRN ${sg.grnNumber}`}
              type="checkbox"
              checked={selectedSourceIds.includes(sg.id)}
              onChange={() => onToggleSource(sg.id)}
              onClick={(e) => e.stopPropagation()}
              disabled={submitting}
            />
          ),
        },
        {
          key: 'grnNumber',
          header: 'GRN & Season',
          sortable: true,
          sortType: 'text',
          sortAccessor: (sg) => sg.grnNumber,
          render: (sg) => {
            const srcSeason = seasonYearForInwardDate(sg.date);
            const isSame = srcSeason === targetSeason;
            return (
              <div>
                <span
                  style={{ fontWeight: 'var(--font-semibold)', color: 'var(--color-text-primary)' }}
                >
                  {sg.grnNumber}
                </span>
                <div
                  style={{ display: 'flex', gap: '4px', alignItems: 'center', marginTop: '2px' }}
                >
                  <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
                    {formatDisplayDate(sg.date)}
                  </span>
                  <Badge variant={isSame ? 'neutral' : 'warning'}>
                    {isSame ? `Season ${srcSeason}` : `Prev ${srcSeason}`}
                  </Badge>
                </div>
              </div>
            );
          },
        },
        {
          key: 'customerName',
          header: 'Customer',
          sortable: true,
          sortType: 'text',
          sortAccessor: (sg) => sg.customerName,
          render: (sg) => sg.customerName,
        },
        {
          key: 'commodity',
          header: 'Commodity & Chamber',
          sortable: true,
          sortType: 'text',
          sortAccessor: (sg) => sg.commodityName,
          render: (sg) => `${sg.commodityName} (Ch. ${sg.chamber})`,
        },
        {
          key: 'bagType',
          header: 'Bag Type',
          align: 'center',
          render: (sg) => {
            const hasDiff =
              (sg.smallBagPrice != null || sg.bigBagPrice != null) &&
              sg.smallBagPrice !== sg.bigBagPrice;
            const isHybrid = (sg.bagPrice != null && !hasDiff) || isHybridBagCategory(sg.bagType);
            return <Badge variant="neutral">{isHybrid ? 'Hybrid' : sg.bagType}</Badge>;
          },
        },
        {
          key: 'availableBags',
          header: 'Available Bags',
          align: 'right',
          sortable: true,
          sortType: 'number',
          sortAccessor: (sg) => sg.closingBags ?? sg.bags,
          render: (sg) => {
            const s = sg.smallBags ?? 0;
            const b = sg.bigBags ?? 0;
            const tot = sg.closingBags ?? sg.bags;
            const hasDiff =
              (sg.smallBagPrice != null || sg.bigBagPrice != null) &&
              sg.smallBagPrice !== sg.bigBagPrice;
            const isInitialVerified = isBagCompositionVerified({
              bagType: sg.bagType,
              bags: sg.bags,
              smallBags: sg.smallBags,
              bigBags: sg.bigBags,
            });
            const isHybrid = (sg.bagPrice != null && !hasDiff) || isHybridBagCategory(sg.bagType);
            const unconf = hasDiff && !isInitialVerified;
            return (
              <div>
                <span style={{ fontWeight: 'var(--font-semibold)' }}>{tot}</span>
                <div
                  style={{
                    fontSize: 'var(--text-xs)',
                    color: unconf ? 'var(--color-warning-text)' : 'var(--color-text-muted)',
                  }}
                >
                  {unconf ? 'Pending Verification' : isHybrid ? 'Uniform Rate' : `${s}S · ${b}B`}
                </div>
              </div>
            );
          },
        },
        {
          key: 'rent',
          header: 'Rent',
          align: 'right',
          render: (sg) =>
            sg.rentAmount != null ? `₹${sg.rentAmount.toLocaleString('en-IN')}` : '—',
        },
        {
          key: 'loan',
          header: 'Loan',
          align: 'center',
          render: (sg) => (
            <Badge variant={sg.loanStatus === 'CLEARED' ? 'success' : 'neutral'}>
              {sg.loanStatus === 'CLEARED' ? 'Cleared' : 'None'}
            </Badge>
          ),
        },
      ]}
      rows={eligibleSources}
      rowKey={(sg) => sg.id}
      caption="Source GRNs to Merge"
      emptyMessage="No other open eligible GRNs found in this facility."
      onRowClick={!submitting ? (sg) => onToggleSource(sg.id) : undefined}
    />
  );
}
