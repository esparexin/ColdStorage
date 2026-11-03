'use client';

import React from 'react';
import { type RentExtension, type RentSummaryDto } from '@cold-storage/contracts';
import { Badge } from '@/components/ui';
import {
  deriveHamaliChargeFromSummary,
  formatAgreedRates,
  formatBillingPeriodSubtitle,
  formatExtensionPeriodSubtitle,
  formatHamaliCalculationSubtitle,
} from '../hooks/rentDisplay.helper';
import { parseMergedConsignmentBreakdown } from '../hooks/mergedConsignmentBilling.helper';
import styles from '../page.module.css';

export interface RentBillingChargesSectionProps {
  account: RentSummaryDto;
  originSeason: number;
  periodLabel: (ext: RentExtension) => string;
}

export function RentBillingChargesSection({
  account,
  originSeason,
  periodLabel,
}: RentBillingChargesSectionProps) {
  const agreedRates = formatAgreedRates(account);
  const hamaliDue = deriveHamaliChargeFromSummary(account.totalDue, account.rentAmount, account.extensions);
  const breakdown =
    account.mergedConsignment ??
    parseMergedConsignmentBreakdown(account.remarks, account.totalBags, account.customerName);

  const totalEntries = 1 + account.extensions.length + (hamaliDue > 0 ? 1 : 0);

  return (
    <>
      <p className={styles.sectionLabel}>
        Billing Periods & Charges ({totalEntries})
      </p>
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
      <div className={styles.paymentsList}>
        <div className={styles.paymentItem}>
          <div>
            <div className={styles.paymentHead}>
              <strong className={styles.receiptNumber}>
                Season {originSeason} — {account.rentType === 'Seasonal' ? 'Storage Rent' : `${account.rentType} Storage`}
              </strong>
              <Badge variant="primary">{account.rentType}</Badge>
              <Badge variant={account.remainingBalance === 0 ? 'success' : 'warning'}>
                {account.remainingBalance === 0 ? 'Settled' : 'Pending'}
              </Badge>
            </div>
            <span className={styles.paymentMeta}>
              {formatBillingPeriodSubtitle({
                rentType: account.rentType,
                seasonYear: originSeason,
                totalBags: account.totalBags,
                rates: agreedRates,
                rentMonths: account.rentMonths,
                rentAmount: account.rentAmount,
              })}
            </span>
          </div>
          <strong className={styles.chargeAmount}>
            {account.rentAmount > 0 ? `₹${account.rentAmount.toLocaleString('en-IN')}` : '₹0 (At Outward)'}
          </strong>
        </div>
        {account.extensions.map((ext) => (
          <div key={ext.id} className={styles.paymentItem}>
            <div>
              <div className={styles.paymentHead}>
                <strong className={styles.receiptNumber}>{periodLabel(ext)}</strong>
                <Badge variant={ext.manualAmount != null ? 'warning' : 'neutral'}>
                  {ext.manualAmount != null ? 'Overridden' : 'Finalized'}
                </Badge>
                <Badge variant={account.remainingBalance === 0 ? 'success' : 'warning'}>
                  {account.remainingBalance === 0 ? 'Settled' : 'Pending'}
                </Badge>
              </div>
              <span className={styles.paymentMeta}>
                {formatExtensionPeriodSubtitle(ext)} · {new Date(ext.finalizedAt).toLocaleDateString('en-IN')} · by {ext.finalizedBy}
              </span>
              {ext.manualAmount != null && (
                <span className={styles.paymentNotes}>
                  Calculated ₹{ext.calculatedAmount.toLocaleString('en-IN')}
                  {ext.overrideReason ? ` · ${ext.overrideReason}` : ''}
                </span>
              )}
            </div>
            <strong className={styles.chargeAmount}>
              ₹{ext.finalAmount.toLocaleString('en-IN')}
            </strong>
          </div>
        ))}
        {hamaliDue > 0 && (
          <div className={styles.paymentItem}>
            <div>
              <div className={styles.paymentHead}>
                <strong className={styles.receiptNumber}>Hamali Labor & Handling Charges</strong>
                <Badge variant="neutral">Handling</Badge>
              </div>
              <span className={styles.paymentMeta}>
                {formatHamaliCalculationSubtitle({ hamaliDue, totalBags: account.totalBags })}
              </span>
            </div>
            <strong className={styles.chargeAmount}>
              ₹{hamaliDue.toLocaleString('en-IN')}
            </strong>
          </div>
        )}
        {breakdown && breakdown.sources.length > 0 && (
          <div style={{ marginTop: 'var(--space-2)', padding: 'var(--space-2)', background: 'var(--color-surface-2)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)' }}>
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
      </div>
    </>
  );
}
