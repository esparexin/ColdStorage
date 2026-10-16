'use client';

import React from 'react';
import { Printer } from 'lucide-react';
import { type RentExtension, type RentSummaryDto } from '@cold-storage/contracts';
import { Badge, Button, FeedbackStates } from '@/components/ui';
import { Banner } from '@/components/ui/Banner';
import {
  deriveHamaliChargeFromSummary,
  formatAgreedRates,
  formatBillingPeriodSubtitle,
  formatExtensionPeriodSubtitle,
} from '../hooks/rentDisplay.helper';
import styles from '../page.module.css';

interface RentCashMemosTabProps {
  account: RentSummaryDto;
  originSeason: number;
  canPrint: boolean;
  printingReceiptNum: string | null;
  error: string | null;
  onPrintReceipt: (receiptNumber: string) => void;
  periodLabel: (ext: RentExtension) => string;
}

export function RentCashMemosTab({
  account,
  originSeason,
  canPrint,
  printingReceiptNum,
  error,
  onPrintReceipt,
  periodLabel,
}: RentCashMemosTabProps) {
  const agreedRates = formatAgreedRates(account);
  const hamaliDue = deriveHamaliChargeFromSummary(account.totalDue, account.rentAmount, account.extensions);
  const totalEntries = account.extensions.length + 1 + (hamaliDue > 0 ? 1 : 0);

  return (
    <>
      <h4 className={styles.sectionLabel}>
        Billing Periods & Charges ({totalEntries})
      </h4>
      <div className={styles.paymentsList}>
        <div className={styles.paymentItem}>
          <div>
            <div className={styles.paymentHead}>
              <strong className={styles.receiptNumber}>Season {originSeason} — Original</strong>
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
            ₹{account.rentAmount.toLocaleString('en-IN')}
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
                Physical inward / repacking handling labor charge recorded on account
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
      </div>

      <h4 className={styles.sectionLabel}>
        Issued Official Cash Memos ({account.payments.length})
      </h4>

      {error && <Banner message={error} id="rent-history-error" />}

      {account.payments.length === 0 ? (
        <FeedbackStates.Empty message="No cash memos issued yet for this account." />
      ) : (
        <div className={styles.paymentsList}>
          {account.payments.map((p) => (
            <div key={p.id} className={styles.paymentItem}>
              <div>
                <div className={styles.paymentHead}>
                  <strong className={styles.receiptNumber}>{p.receiptNumber}</strong>
                  <Badge variant={p.paymentMode === 'Cash' ? 'primary' : 'success'}>
                    {p.paymentMode}
                  </Badge>
                </div>
                <span className={styles.paymentMeta}>
                  {new Date(p.paymentDate).toLocaleDateString('en-IN')} • Received by{' '}
                  {p.createdBy}
                </span>
                {p.notes && <span className={styles.paymentNotes}>Notes: {p.notes}</span>}
              </div>

              <div className={styles.paymentActions}>
                <strong className={styles.paymentAmount}>
                  ₹{p.amountPaid.toLocaleString('en-IN')}
                </strong>

                {canPrint && (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => onPrintReceipt(p.receiptNumber)}
                    disabled={printingReceiptNum === p.receiptNumber}
                    isLoading={printingReceiptNum === p.receiptNumber}
                    title="Print Official Cash Memo"
                    leftIcon={<Printer size={13} aria-hidden="true" />}
                  >
                    Print
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
