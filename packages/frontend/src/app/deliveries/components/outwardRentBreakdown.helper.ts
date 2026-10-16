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

function extractYear(periodKey: string, fallbackLabel: string): string {
  const match = periodKey.match(/\d{4}/) || fallbackLabel.match(/\d{4}/);
  return match ? match[0] : '';
}

export function formatSeasonalBreakdownRows(params: {
  periods: Array<{
    periodKey: string;
    label: string;
    periodType: 'SEASON' | 'JANUARY' | 'FEBRUARY';
    smallBags: number;
    bigBags: number;
    smallRate: number;
    bigRate: number;
    amount: number;
  }>;
  isHybrid: boolean;
  totalWithdrawing: number;
  hamaliRate?: number | null;
}): RentBreakdownItem[] {
  const { periods, isHybrid, totalWithdrawing, hamaliRate } = params;
  const rows: RentBreakdownItem[] = [];

  for (let i = 0; i < periods.length; i++) {
    const p = periods[i];
    const yr = extractYear(p.periodKey, p.label);

    if (p.periodType === 'SEASON') {
      const title = yr ? `(${yr}) Mar - Dec` : p.label;
      let formula = '';
      if (isHybrid) {
        formula = `${totalWithdrawing} Bags × ₹${p.smallRate} (₹${p.amount.toLocaleString('en-IN')})`;
      } else {
        const parts: string[] = [];
        if (p.smallBags > 0) parts.push(`${p.smallBags} Small × ₹${p.smallRate} (₹${(p.smallBags * p.smallRate).toLocaleString('en-IN')})`);
        if (p.bigBags > 0) parts.push(`${p.bigBags} Big × ₹${p.bigRate} (₹${(p.bigBags * p.bigRate).toLocaleString('en-IN')})`);
        formula = parts.join(' + ') || '0 bags';
      }
      rows.push({
        id: p.periodKey,
        title,
        periodMeta: '',
        details: formula,
        amount: p.amount,
      });
    } else if (p.periodType === 'JANUARY') {
      const next = periods[i + 1];
      if (next && next.periodType === 'FEBRUARY') {
        const combinedAmt = Number((p.amount + next.amount).toFixed(2));
        let formula = '';
        if (isHybrid) {
          formula = `${totalWithdrawing} Bags × ₹${(p.smallRate * 2).toFixed(2)} (₹${combinedAmt.toLocaleString('en-IN')})`;
        } else {
          const parts: string[] = [];
          if (p.smallBags > 0) parts.push(`${p.smallBags} Small × ₹${(p.smallRate * 2).toFixed(2)} (₹${(p.smallBags * p.smallRate * 2).toLocaleString('en-IN')})`);
          if (p.bigBags > 0) parts.push(`${p.bigBags} Big × ₹${(p.bigRate * 2).toFixed(2)} (₹${(p.bigBags * p.bigRate * 2).toLocaleString('en-IN')})`);
          formula = parts.join(' + ') || '0 bags';
        }
        rows.push({
          id: `${p.periodKey}_${next.periodKey}`,
          title: 'Jan - Feb',
          periodMeta: '',
          details: `${formula} (2 months)`,
          amount: combinedAmt,
        });
        i++; // skip next since combined
      } else {
        const title = yr ? `Jan ${yr}` : 'January';
        const formula = isHybrid
          ? `${totalWithdrawing} Bags × ₹${p.smallRate} (₹${p.amount.toLocaleString('en-IN')})`
          : `${p.smallBags} Small × ₹${p.smallRate} + ${p.bigBags} Big × ₹${p.bigRate}`;
        rows.push({
          id: p.periodKey,
          title,
          periodMeta: '',
          details: formula,
          amount: p.amount,
        });
      }
    } else if (p.periodType === 'FEBRUARY') {
      const title = yr ? `Feb ${yr}` : 'February';
      const formula = isHybrid
        ? `${totalWithdrawing} Bags × ₹${p.smallRate} (₹${p.amount.toLocaleString('en-IN')})`
        : `${p.smallBags} Small × ₹${p.smallRate} + ${p.bigBags} Big × ₹${p.bigRate}`;
      rows.push({
        id: p.periodKey,
        title,
        periodMeta: '',
        details: formula,
        amount: p.amount,
      });
    }
  }

  return appendHamaliRowIfNeeded(rows, totalWithdrawing, hamaliRate);
}

export function appendHamaliRowIfNeeded(
  rows: RentBreakdownItem[],
  totalWithdrawing: number,
  hamaliRate?: number | null,
): RentBreakdownItem[] {
  if (typeof hamaliRate === 'number' && hamaliRate > 0 && totalWithdrawing > 0) {
    return [
      ...rows,
      {
        id: 'hamali-charges',
        title: 'Hamali Charges',
        periodMeta: '',
        details: `${totalWithdrawing} bags × ₹${hamaliRate.toFixed(2)} / bag`,
        amount: Number((totalWithdrawing * hamaliRate).toFixed(2)),
      },
    ];
  }
  return rows;
}

export const breakdownColumns: DataTableColumn<RentBreakdownItem>[] = [
  {
    key: 'dates',
    header: 'Rent Dates',
    render: (r) => (
      r.periodMeta
        ? React.createElement('div', null,
            React.createElement('div', { style: { fontWeight: 'var(--font-medium)' } }, r.title),
            React.createElement('div', { style: { fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' } }, r.periodMeta),
          )
        : React.createElement('div', { style: { fontWeight: 'var(--font-medium)' } }, r.title)
    ),
  },
  {
    key: 'details',
    header: 'Rent Details',
    render: (r) => React.createElement('span', { style: { color: 'var(--color-text-secondary)' } }, r.details),
  },
  {
    key: 'amount',
    header: 'Amount',
    align: 'right',
    render: (r) => (
      React.createElement('span', { style: { fontWeight: 'var(--font-medium)' } },
        `₹${r.amount.toLocaleString('en-IN')}`,
      )
    ),
  },
];
