'use client';

import React from 'react';
import { type RentExtension, type RentSummaryDto } from '@cold-storage/contracts';
import { Badge } from '@/components/ui';
import { Banner } from '@/components/ui/Banner';
import {
  deriveHamaliChargeFromSummary,
  formatAgreedRates,
  formatBillingPeriodSubtitle,
  formatExtensionPeriodSubtitle,
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
      {breakdown && (
        <Banner
          variant="info"
          message={`Consolidated Merged Consignment: Received +${breakdown.totalMergedAddedBags} bags from source GRN${breakdown.sources.length > 1 ? 's' : ''} ${breakdown.sources.map((s) => s.grnNumber).join(', ')}. Source GRN rent dues remain as separate pending bills under their respective GRN accounts.`}
          id="merged-consignment-notice"
        />
      )}
      {account.mergedIntoGrnNumber && (
        <Banner
          variant="info"
          message={`Separate GRN Bill: This GRN was merged into GRN #${account.mergedIntoGrnNumber}. Outstanding dues remain as an independent collectible bill under ${account.customerName} and are not carried forward to the target GRN.`}
          id="merged-source-notice"
        />
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
              })}
            </span>
          </div>
          <strong className={styles.paymentAmount}>
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
            <strong className={styles.paymentAmount}>
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
                Physical inward handling labor charge recorded on account
              </span>
            </div>
            <strong className={styles.paymentAmount}>
              ₹{hamaliDue.toLocaleString('en-IN')}
            </strong>
          </div>
        )}
        <div className={styles.paymentItem}>
          <div>
            <div className={styles.paymentHead}>
              <strong className={styles.receiptNumber}>Total Due</strong>
            </div>
          </div>
          <strong className={styles.paymentAmount}>
            ₹{account.totalDue.toLocaleString('en-IN')}
          </strong>
        </div>
        {breakdown && breakdown.sources.length > 0 && (
          <div style={{ marginTop: 'var(--space-2)', padding: 'var(--space-3)', background: 'var(--color-surface-2)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-1)' }}>
              <strong style={{ fontSize: 'var(--text-xs)', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--color-text-secondary)' }}>
                Source GRN Traceability (Separate Pending Bills)
              </strong>
              <Badge variant="neutral">Independent Bills</Badge>
            </div>
            <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', margin: '0 0 var(--space-2) 0' }}>
              The following source GRNs contributed bags to this merged lot. Their rent dues remain as separate pending bills under their respective GRN accounts in the Rent ledger:
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1-5)' }}>
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
