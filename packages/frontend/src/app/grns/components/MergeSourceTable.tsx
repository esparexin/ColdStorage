'use client';

import React from 'react';
import { seasonYearForInwardDate, type Grn } from '@cold-storage/contracts';
import { Badge, DataTable } from '@/components/ui';

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
          render: (sg) => {
            const srcSeason = seasonYearForInwardDate(sg.date);
            const isSame = srcSeason === targetSeason;
            return (
              <div>
                <strong>{sg.grnNumber}</strong>
                <div style={{ display: 'flex', gap: '4px', alignItems: 'center', marginTop: '2px' }}>
                  <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
                    {new Date(sg.date).toLocaleDateString('en-IN')}
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
          render: (sg) => sg.customerName,
        },
        {
          key: 'commodity',
          header: 'Commodity & Chamber',
          render: (sg) => `${sg.commodityName} (Ch. ${sg.chamber})`,
        },
        {
          key: 'availableBags',
          header: 'Available Bags',
          align: 'right',
          render: (sg) => {
            const s = sg.smallBags ?? 0;
            const b = sg.bigBags ?? 0;
            const tot = sg.closingBags ?? sg.bags;
            const unconf = (s === 0 && b === 0 && tot > 0) || (s + b !== tot);
            return (
              <div>
                <span style={{ fontWeight: 'var(--font-semibold)' }}>{tot}</span>
                <div
                  style={{
                    fontSize: 'var(--text-xs)',
                    color: unconf ? 'var(--color-warning-text)' : 'var(--color-text-muted)',
                  }}
                >
                  {unconf ? 'Pending Verification' : `${s}S · ${b}B`}
                </div>
              </div>
            );
          },
        },
        {
          key: 'rent',
          header: 'Rent',
          align: 'right',
          render: (sg) => (sg.rentAmount != null ? `₹${sg.rentAmount.toLocaleString('en-IN')}` : '—'),
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
