'use client';

import React, { useMemo } from 'react';
import { type RentExtension, type RentSummaryDto } from '@cold-storage/contracts';
import { Badge, DataTable, type DataTableColumn } from '@/components/ui';
import {
  deriveHamaliChargeFromSummary,
  formatAgreedRates,
} from '../hooks/rentDisplay.helper';
import { parseMergedConsignmentBreakdown } from '../hooks/mergedConsignmentBilling.helper';
import styles from '../page.module.css';

export interface RentBillingChargesSectionProps {
  account: RentSummaryDto;
  originSeason: number;
  periodLabel: (ext: RentExtension) => string;
}

interface RentCalculationRow {
  id: string;
  dates: string;
  details: string;
  amount: number;
}

const calculationColumns: DataTableColumn<RentCalculationRow>[] = [
  {
    key: 'dates',
    header: 'Rent Dates',
    render: (r) => <span style={{ fontWeight: 'var(--font-medium)' }}>{r.dates}</span>,
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
      <span style={{ fontWeight: 'var(--font-semibold)', fontVariantNumeric: 'tabular-nums' }}>
        ₹{r.amount.toLocaleString('en-IN')}
      </span>
    ),
  },
];

export function RentBillingChargesSection({
  account,
  originSeason,
  periodLabel,
}: RentBillingChargesSectionProps) {
  const hamaliDue = deriveHamaliChargeFromSummary(account.totalDue, account.rentAmount, account.extensions);
  const breakdown =
    account.mergedConsignment ??
    parseMergedConsignmentBreakdown(account.remarks, account.totalBags, account.customerName);

  const storageRentTotal =
    account.rentAmount + account.extensions.reduce((sum, e) => sum + e.finalAmount, 0);

  const rows: RentCalculationRow[] = useMemo(() => {
    const list: RentCalculationRow[] = [];
    const agreedRates = formatAgreedRates(account);

    // 1. Storage Rent Period Row
    let datesLabel = `(${originSeason}) Mar - Dec`;
    if (account.rentType === 'Seasonal_3M') {
      datesLabel = `(${originSeason}) 3M Seasonal`;
    } else if (account.rentType === 'Monthly') {
      datesLabel = `Monthly (${account.rentMonths ?? 1} mo)`;
    }

    let formula = '';
    const numSmall = typeof account.smallBags === 'number' ? account.smallBags : 0;
    const numBig = typeof account.bigBags === 'number' ? account.bigBags : 0;
    const hasSmall = numSmall > 0;
    const hasBig = numBig > 0;
    const sRate = account.smallBagPrice ?? (hasSmall && !hasBig && account.rentAmount > 0 ? account.rentAmount / numSmall : null);
    const bRate = account.bigBagPrice ?? (hasBig && !hasSmall && account.rentAmount > 0 ? account.rentAmount / numBig : null);

    if (hasSmall && hasBig && sRate != null && bRate != null) {
      formula = `${numSmall} Small × ₹${sRate.toFixed(2)} + ${numBig} Big × ₹${bRate.toFixed(2)}`;
    } else if (hasSmall && !hasBig && sRate != null) {
      formula = `${numSmall} Small × ₹${sRate.toFixed(2)} (₹${account.rentAmount.toLocaleString('en-IN')})`;
    } else if (hasBig && !hasSmall && bRate != null) {
      formula = `${numBig} Big × ₹${bRate.toFixed(2)} (₹${account.rentAmount.toLocaleString('en-IN')})`;
    } else if (account.bagType === 'Hybrid' && account.rentAmount > 0) {
      const perBag = (account.rentAmount / account.totalBags).toFixed(2);
      formula = `${account.totalBags} Hybrid × ₹${perBag} (₹${account.rentAmount.toLocaleString('en-IN')})`;
    } else if (account.smallBagPrice != null || account.bigBagPrice != null) {
      formula = agreedRates ? `${account.totalBags} bags (${agreedRates})` : `${account.totalBags} bags`;
    } else if (account.bagPrice != null && account.bagPrice > 0) {
      formula = `${account.totalBags} bags × ₹${account.bagPrice.toFixed(2)} (₹${account.rentAmount.toLocaleString('en-IN')})`;
    } else if (account.rentAmount > 0 && account.totalBags > 0) {
      const perBag = (account.rentAmount / account.totalBags).toFixed(2);
      formula = `${account.totalBags} bags × ₹${perBag} (₹${account.rentAmount.toLocaleString('en-IN')})`;
    } else {
      formula = 'Assessed at outward delivery dispatch';
    }

    list.push({
      id: 'storage-rent',
      dates: datesLabel,
      details: formula,
      amount: account.rentAmount,
    });

    // 2. Finalized Extensions Rows (sorted chronologically: Jan before Feb)
    const extBagLabel =
      hasSmall && !hasBig
        ? 'Small'
        : hasBig && !hasSmall
        ? 'Big'
        : account.bagType === 'Hybrid'
        ? 'Hybrid'
        : 'bags';

    const sortedExtensions = [...account.extensions].sort((a, b) => {
      if (a.seasonYear !== b.seasonYear) return a.seasonYear - b.seasonYear;
      const order: Record<string, number> = { JANUARY: 1, FEBRUARY: 2, SEASON: 3 };
      return (order[a.period] ?? 99) - (order[b.period] ?? 99);
    });

    for (const ext of sortedExtensions) {
      let extDateLabel = periodLabel(ext);
      if (ext.period === 'SEASON') {
        extDateLabel = `(${ext.seasonYear}) Season Renewal`;
      } else if (ext.period === 'JANUARY') {
        extDateLabel = `(${ext.seasonYear + 1}) Jan`;
      } else if (ext.period === 'FEBRUARY') {
        extDateLabel = `(${ext.seasonYear + 1}) Feb`;
      }
      list.push({
        id: ext.id,
        dates: extDateLabel,
        details: `${ext.snapshotBags} ${extBagLabel} × ₹${ext.bagRate.toFixed(2)} (₹${ext.finalAmount.toLocaleString('en-IN')})`,
        amount: ext.finalAmount,
      });
    }

    // 3. Hamali Charges Row (only when confirmed eligible hamali exists)
    if (hamaliDue > 0) {
      const hamaliRate = account.totalBags > 0 ? (hamaliDue / account.totalBags).toFixed(2) : '0';
      list.push({
        id: 'hamali-charges',
        dates: 'Hamali Charges',
        details: `${account.totalBags} bags × ₹${hamaliRate} / bag`,
        amount: hamaliDue,
      });
    }

    return list;
  }, [account, originSeason, periodLabel, hamaliDue]);

  return (
    <>
      {account.mergedIntoGrnNumber && (
        <div className={styles.compactNotice}>
          <span>Merged into <strong>GRN #{account.mergedIntoGrnNumber}</strong> · Independent bill preserved</span>
          <Badge variant="neutral">Separate Bill</Badge>
        </div>
      )}
      {breakdown && (
        <div className={styles.compactNotice}>
          <span>Consolidated consignment (+{breakdown.totalMergedAddedBags} bags from GRN {breakdown.sources.map((s) => s.grnNumber).join(', ')})</span>
          <Badge variant="neutral">Source Dues Separate</Badge>
        </div>
      )}

      <div className={styles.breakdownCard}>
        <div className={styles.cardHeader}>
          <div className={styles.titleGroup}>
            <span className={styles.title}>Rent Calculation Breakdown</span>
            <Badge variant="neutral">{account.rentType}</Badge>
          </div>
        </div>

        <DataTable
          columns={calculationColumns}
          rows={rows}
          rowKey={(r) => r.id}
          caption="Rent Calculation Breakdown"
          footer={
            <>
              <tr className={styles.totalRow}>
                <td colSpan={2} style={{ textAlign: 'left' }}>
                  {hamaliDue > 0 ? 'Total Storage Rent' : 'Total Rent Payable'}
                </td>
                <td style={{ textAlign: 'right' }} className={styles.totalAmount}>
                  ₹{storageRentTotal.toLocaleString('en-IN')}
                </td>
              </tr>
              {hamaliDue > 0 && (
                <tr className={styles.totalRow}>
                  <td colSpan={2} style={{ textAlign: 'left' }}>
                    Total Amount to Pay
                  </td>
                  <td style={{ textAlign: 'right' }} className={styles.totalAmount}>
                    ₹{account.totalDue.toLocaleString('en-IN')}
                  </td>
                </tr>
              )}
            </>
          }
        />
      </div>

      {breakdown && breakdown.sources.length > 0 && (
        <div style={{ padding: 'var(--space-2)', background: 'var(--color-surface-2)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-1-5)' }}>
            <strong style={{ fontSize: 'var(--text-xs)', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--color-text-secondary)' }}>
              Source GRN Traceability (Separate Pending Bills)
            </strong>
            <Badge variant="neutral">Independent Bills</Badge>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
            {breakdown.sources.map((s) => (
              <div key={s.grnNumber} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 'var(--text-xs)', padding: 'var(--space-1) var(--space-2)', background: 'var(--color-surface-1)', borderRadius: 'var(--radius-sm)' }}>
                <span>
                  <strong>GRN #{s.grnNumber}</strong> · {s.customerName || 'Consignor'} · {s.bags} bags
                  {s.seasonYear ? ` · Season ${s.seasonYear}` : ''}
                </span>
                <span style={{ fontWeight: 'var(--font-semibold)' }}>
                  Pending: ₹{(s.remainingBalance > 0 ? s.remainingBalance : s.rentAmount).toLocaleString('en-IN')}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
