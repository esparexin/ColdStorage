import React from 'react';
import type { RentSummaryDto } from '@cold-storage/contracts';
import {
  formatAgreedRates,
  formatRemainingDue,
  formatRentStructure,
} from '../hooks/rentDisplay.helper';
import styles from '../page.module.css';

interface RentSummaryOverviewProps {
  account: RentSummaryDto;
}

export function RentSummaryOverview({ account }: RentSummaryOverviewProps) {
  const stockBalance = account.remainingBags ?? Math.max(0, account.totalBags - (account.deliveredBags ?? 0));
  const agreedRates = formatAgreedRates(account);

  return (
    <div className={styles.infoCard}>
      <div className={styles.infoSplit}>
        <div className={styles.infoBlock}>
          <span className={styles.infoBlockTitle}>Bag Inventory Status</span>
          <div className={styles.infoRow}>
            <span style={{ color: 'var(--color-text-muted)' }}>Commodity</span>
            <span>{account.commodityName}</span>
          </div>
          <div className={styles.infoRow}>
            <span style={{ color: 'var(--color-text-muted)' }}>Chamber</span>
            <span>{account.chamber}</span>
          </div>
          <div className={styles.infoRow}>
            <span style={{ color: 'var(--color-text-muted)' }}>Inward Stored</span>
            <strong>{account.totalBags.toLocaleString('en-IN')} bags</strong>
          </div>
          <div className={styles.infoRow}>
            <span style={{ color: 'var(--color-text-muted)' }}>Outward Delivered</span>
            <span>{(account.deliveredBags ?? 0).toLocaleString('en-IN')} bags</span>
          </div>
          {account.totalBagsWeight != null && account.totalBagsWeight > 0 && (
            <div className={styles.infoRow}>
              <span style={{ color: 'var(--color-text-muted)' }}>Bags Weight</span>
              <span>{account.totalBagsWeight.toLocaleString('en-IN')} kg</span>
            </div>
          )}
          <div className={styles.infoRow} style={{ borderTop: '1px solid var(--color-border)', paddingTop: 'var(--space-1)' }}>
            <span style={{ fontWeight: 'var(--font-semibold)' }}>Stock Balance</span>
            <strong style={{ color: stockBalance > 0 ? 'var(--color-warning-text)' : 'var(--color-text-muted)' }}>
              {stockBalance.toLocaleString('en-IN')} bags
            </strong>
          </div>
        </div>

        <div className={styles.infoBlock}>
          <span className={styles.infoBlockTitle}>Rent Obligation</span>
          <div className={styles.infoRow}>
            <span style={{ color: 'var(--color-text-muted)' }}>Structure</span>
            <span>
              {account.rentType}
              {account.rentType === 'Monthly' && account.rentMonths ? ` (${account.rentMonths}m)` : ''}
            </span>
          </div>
          {agreedRates && (
            <div className={styles.infoRow}>
              <span style={{ color: 'var(--color-text-muted)' }}>Agreed Rates</span>
              <span style={{ fontWeight: 'var(--font-medium)' }}>{agreedRates}</span>
            </div>
          )}
          <div className={styles.infoRow}>
            <span style={{ color: 'var(--color-text-muted)' }}>
              {account.rentType === 'Monthly' && account.rentAmount === 0 ? 'Rent Status' : 'Contract Rent'}
            </span>
            <span>
              {account.rentType === 'Monthly' && account.rentAmount === 0
                ? 'Dynamic (Cycle Billing)'
                : formatRentStructure(account)}
            </span>
          </div>
          <div className={styles.infoRow}>
            <span style={{ color: 'var(--color-text-muted)' }}>Already Paid</span>
            <span style={{ color: 'var(--color-success-text)' }}>
              ₹{account.totalPaid.toLocaleString('en-IN')}
            </span>
          </div>
          <div className={styles.infoRow} style={{ borderTop: '1px solid var(--color-border)', paddingTop: 'var(--space-1)' }}>
            <span style={{ fontWeight: 'var(--font-semibold)' }}>Remaining Due</span>
            <strong style={{ color: 'var(--color-warning-text)' }}>
              {formatRemainingDue(account)}
            </strong>
          </div>
        </div>
      </div>
    </div>
  );
}
