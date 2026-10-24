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
import { parseMergedConsignmentBreakdown } from '../hooks/mergedConsignmentBilling.helper';
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
  const breakdown =
    account.mergedConsignment ??
    parseMergedConsignmentBreakdown(account.remarks, account.totalBags, account.customerName);
  const repackDeduction = (breakdown?.repackHamali?.amount ?? 0) + (breakdown?.totalCarriedRent ?? 0);
  const targetBaseRent = breakdown
    ? (account.rentAmount > repackDeduction ? account.rentAmount - repackDeduction : 0)
    : account.rentAmount;

  const totalEntries = breakdown
    ? (targetBaseRent > 0 || breakdown.genesisBags > 0 ? 1 : 0) +
      (breakdown.repackHamali ? 1 : 0) +
      account.extensions.length +
      (hamaliDue > 0 ? 1 : 0)
    : account.extensions.length + 1 + (hamaliDue > 0 ? 1 : 0);

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
        {!breakdown ? (
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
        ) : (
          <>
            {(targetBaseRent > 0 || breakdown.genesisBags > 0) && (
              <div className={styles.paymentItem}>
                <div>
                  <div className={styles.paymentHead}>
                    <strong className={styles.receiptNumber}>
                      Season {originSeason} — {targetBaseRent > 0 ? `Genesis Inward (${breakdown.genesisCustomerName})` : 'Storage Stock'}
                    </strong>
                    <Badge variant="primary">Season {originSeason}</Badge>
                    <Badge variant={targetBaseRent > 0 ? 'neutral' : 'warning'}>
                      {targetBaseRent > 0 ? 'Genesis Stock' : 'At Outward Dispatch'}
                    </Badge>
                  </div>
                  <span className={styles.paymentMeta}>
                    {targetBaseRent > 0
                      ? `${breakdown.genesisBags.toLocaleString('en-IN')} original inward bags · ${breakdown.genesisCustomerName}${agreedRates ? ` · ${agreedRates}` : ''}`
                      : `${account.totalBags.toLocaleString('en-IN')} total bags in storage (${breakdown.genesisBags} Genesis + ${breakdown.totalMergedAddedBags} Merged) · Storage rent calculated upon Outward Delivery & Gate Pass`}
                  </span>
                </div>
                <strong className={styles.paymentAmount}>
                  {targetBaseRent > 0 ? `₹${targetBaseRent.toLocaleString('en-IN')}` : '₹0 (At Outward)'}
                </strong>
              </div>
            )}
            {breakdown.repackHamali && (
              <div className={styles.paymentItem}>
                <div>
                  <div className={styles.paymentHead}>
                    <strong className={styles.receiptNumber}>
                      Repacking Labor & Handling ({breakdown.repackHamali.repackBags} Bags)
                    </strong>
                    <Badge variant="neutral">Repack Labor</Badge>
                  </div>
                  <span className={styles.paymentMeta}>
                    {breakdown.repackHamali.repackBags.toLocaleString('en-IN')} newly repacked bags @ ₹{breakdown.repackHamali.ratePerBag}/bag labor
                  </span>
                </div>
                <strong className={styles.paymentAmount}>
                  ₹{breakdown.repackHamali.amount.toLocaleString('en-IN')}
                </strong>
              </div>
            )}
          </>
        )}
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

      <p className={styles.sectionLabel}>
        Issued Official Cash Memos ({account.payments.length})
      </p>

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
