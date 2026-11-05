'use client';

import React, { useMemo } from 'react';
import { Printer } from 'lucide-react';
import { type DeliveryChallan, type RentExtension, type RentSummaryDto } from '@cold-storage/contracts';
import { Badge, Button, FeedbackStates } from '@/components/ui';
import { Banner } from '@/components/ui/Banner';
import { formatReceivedBy } from '../hooks/rentDisplay.helper';
import { RentBillingChargesSection } from './RentBillingChargesSection';
import styles from '../page.module.css';

export interface RentCashMemosTabProps {
  account: RentSummaryDto;
  selectedDeliveryId?: string;
  selectedDeliveryChallanNumber?: string | null;
  originSeason: number;
  canPrint: boolean;
  canCollect?: boolean;
  printingReceiptNum: string | null;
  error: string | null;
  onPrintReceipt: (receiptNumber: string) => void;
  onCollectDelivery?: (delivery: DeliveryChallan) => void;
  periodLabel: (ext: RentExtension) => string;
}

export function RentCashMemosTab({
  account,
  selectedDeliveryId,
  selectedDeliveryChallanNumber,
  originSeason,
  canPrint,
  canCollect,
  printingReceiptNum,
  error,
  onPrintReceipt,
  onCollectDelivery,
  periodLabel,
}: RentCashMemosTabProps) {
  const relevantPayments = useMemo(() => {
    if (!selectedDeliveryId) return account.payments;
    const directMatches = account.payments.filter(
      (p) =>
        p.deliveryId === selectedDeliveryId ||
        (selectedDeliveryChallanNumber && p.challanNumber === selectedDeliveryChallanNumber),
    );
    if (directMatches.length > 0) return directMatches;
    // If no direct matches but GRN has payments, show payments
    return account.payments;
  }, [account.payments, selectedDeliveryId, selectedDeliveryChallanNumber]);

  const isOutwardAssessed =
    (account.outwardRentCharges ?? 0) > 0 ||
    (account.deliveredBags ?? 0) > 0 ||
    Boolean(selectedDeliveryId);

  return (
    <>
      {error && <Banner message={error} id="rent-history-error" />}

      <RentBillingChargesSection
        account={account}
        selectedDeliveryId={selectedDeliveryId}
        originSeason={originSeason}
        periodLabel={periodLabel}
        canCollect={canCollect}
        onCollectDelivery={onCollectDelivery}
        canPrint={canPrint}
        printingReceiptNum={printingReceiptNum}
        onPrintReceipt={onPrintReceipt}
      />

      {!isOutwardAssessed && (
        <>
          <p className={styles.sectionLabel}>
            Issued Official Cash Memos ({relevantPayments.length})
          </p>

          {relevantPayments.length === 0 ? (
            <FeedbackStates.Empty message="No cash memos issued yet for this account." />
          ) : (
            <div className={styles.paymentsList}>
              {relevantPayments.map((p) => (
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
                      {formatReceivedBy(p.createdBy)}
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
      )}
    </>
  );
}
