import React from 'react';
import type { DataTableColumn } from '@/components/ui';

export interface RentBreakdownItem {
  id: string;
  title: string;
  periodMeta: string;
  details: string;
  amount: number;
}

export function getPeriodMeta(periodType: string) {
  if (periodType === 'JANUARY') return { type: 'Monthly Extension', range: 'Jan 1 – Jan 31' };
  if (periodType === 'FEBRUARY') return { type: 'Monthly Extension', range: 'Feb 1 – Feb 28' };
  return { type: 'Seasonal Storage', range: 'Mar 1 – Dec 31' };
}

export const breakdownColumns: DataTableColumn<RentBreakdownItem>[] = [
  {
    key: 'dates',
    header: 'Rent Dates',
    render: (r) => (
      <div>
        <div style={{ fontWeight: 'var(--font-medium)' }}>{r.title}</div>
        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>{r.periodMeta}</div>
      </div>
    ),
  },
  {
    key: 'details',
    header: 'Rent Details',
    render: (r) => <span style={{ color: 'var(--color-text-secondary)' }}>{r.details}</span>,
  },
  {
    key: 'amount',
    header: 'Amount',
    align: 'right',
    render: (r) => (
      <span style={{ fontWeight: 'var(--font-medium)' }}>
        ₹{r.amount.toLocaleString('en-IN')}
      </span>
    ),
  },
];
