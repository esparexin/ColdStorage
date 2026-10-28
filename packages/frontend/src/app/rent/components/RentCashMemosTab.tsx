'use client';

import React from 'react';
import { Printer } from 'lucide-react';
import { type RentExtension, type RentSummaryDto } from '@cold-storage/contracts';
import { Badge, Button, FeedbackStates } from '@/components/ui';
import { Banner } from '@/components/ui/Banner';
import { RentBillingChargesSection } from './RentBillingChargesSection';
import styles from '../page.module.css';

export interface RentCashMemosTabProps {
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
  return (
    <>
      <RentBillingChargesSection
        account={account}
        originSeason={originSeason}
        periodLabel={periodLabel}
      />

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
