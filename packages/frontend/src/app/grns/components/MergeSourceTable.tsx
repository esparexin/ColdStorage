'use client';

import {
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
  initiatingGrnId?: string;
  targetGrnId?: string;
}

export function MergeSourceTable({
  eligibleSources,
  selectedSourceIds,
  targetGrnDate,
  submitting,
  onToggleSource,
  initiatingGrnId,
  targetGrnId,
}: MergeSourceTableProps) {
  const targetSeason = seasonYearForInwardDate(targetGrnDate);

  return (
    <DataTable
      columns={[
        {
          key: 'select',
          header: 'Sel',
          render: (sg) => {
            const isInitiatingSource = sg.id === initiatingGrnId && targetGrnId !== initiatingGrnId;
            return (
              <input
                id={`select-source-${sg.id}`}
                aria-label={`Select GRN ${sg.grnNumber}`}
                type="checkbox"
                checked={selectedSourceIds.includes(sg.id)}
                onChange={() => !isInitiatingSource && onToggleSource(sg.id)}
                onClick={(e) => e.stopPropagation()}
                disabled={submitting || isInitiatingSource}
              />
            );
          },
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
                  {!isSame && (
                    <Badge variant="warning">
                      {`Prev ${srcSeason}`}
                    </Badge>
                  )}
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
          header: 'Commodity',
          sortable: true,
          sortType: 'text',
          sortAccessor: (sg) => sg.commodityName,
          render: (sg) => sg.commodityName,
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
            const isHybrid = (sg.bagPrice != null && !hasDiff) || isHybridBagCategory(sg.bagType);
            const isVerified = sg.isCompositionVerified === true;
            const isReconciled = tot === s + b;
            const splitText = isHybrid
              ? 'Uniform Rate'
              : !isVerified
                ? ''
                : isReconciled && (s > 0 || b > 0)
                  ? `${s}S · ${b}B`
                  : b === 0 && s > 0
                    ? `${tot}S · 0B`
                    : s === 0 && b > 0
                      ? `0S · ${tot}B`
                      : '';
            return (
              <div>
                <span style={{ fontWeight: 'var(--font-semibold)' }}>{tot}</span>
                {splitText && (
                  <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
                    {splitText}
                  </div>
                )}
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
      onRowClick={!submitting ? (sg) => {
        if (sg.id === initiatingGrnId && targetGrnId !== initiatingGrnId) return;
        onToggleSource(sg.id);
      } : undefined}
    />
  );
}
