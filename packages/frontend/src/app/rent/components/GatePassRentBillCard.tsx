'use client';

import React, { useMemo } from 'react';
import { IndianRupee, Printer } from 'lucide-react';
import type { DeliveryChallan, RentSummaryDto } from '@cold-storage/contracts';
import { Badge, Button } from '@/components/ui';
import { OutwardRentBreakdown } from '@/app/deliveries/components/OutwardRentBreakdown';
import { formatReceivedBy } from '../hooks/rentDisplay.helper';
import styles from '../page.module.css';

export interface GatePassRentBillCardProps {
  delivery: DeliveryChallan;
  index: number;
  account: RentSummaryDto;
  agreedRates: { small: number; big: number };
  monthlyRates?: { small: number; big: number };
  hamaliRate?: number;
  excludePeriodKeys: string[];
  canCollect?: boolean;
  onCollectDelivery?: (delivery: DeliveryChallan) => void;
  canPrint?: boolean;
  printingReceiptNum?: string | null;
  onPrintReceipt?: (receiptNumber: string) => void;
}

export function GatePassRentBillCard({
  delivery: d,
  index: idx,
  account,
  agreedRates,
  monthlyRates,
  hamaliRate,
  excludePeriodKeys,
  canCollect,
  onCollectDelivery,
  canPrint,
  printingReceiptNum,
  onPrintReceipt,
}: GatePassRentBillCardProps) {
  const isGrnSettled = account.remainingBalance <= 0 && account.totalPaid > 0;
  const deliveryCharge = d.rentCharge ?? 0;
  const remainingDue = isGrnSettled ? 0 : (d.rentRemainingBalance ?? deliveryCharge);
  const totalPaid = isGrnSettled ? deliveryCharge : (d.rentTotalPaid ?? 0);
  const isSettled = remainingDue <= 0 && (totalPaid > 0 || isGrnSettled);
  const isPartiallyPaid = !isSettled && totalPaid > 0;

  const linkedPayments = useMemo(() => {
    const direct = (account.payments ?? []).filter(
      (p) =>
        p.deliveryId === d.id ||
        (p.challanNumber && p.challanNumber === d.challanNumber) ||
        (p.gpNumber && d.gpNumber && p.gpNumber === d.gpNumber),
    );
    if (direct.length > 0) return direct;
    if (totalPaid > 0) {
      return (account.payments ?? []).filter(
        (p) => !p.deliveryId && !p.challanNumber && !p.gpNumber,
      );
    }
    return [];
  }, [account.payments, d.id, d.challanNumber, d.gpNumber, totalPaid]);

  return (
    <div className={styles.gatePassBillCard}>
      <div className={styles.gatePassBillHeader}>
        <div className={styles.gatePassBillTitle}>
          <div className={styles.gatePassBillName}>
            <strong>{`RENT BILL #${idx + 1}: Gate Pass ${d.challanNumber}${d.gpNumber ? ` (${d.gpNumber})` : ''} · ${new Date(d.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}`}</strong>
            <Badge variant={d.status === 'ISSUED' ? 'success' : 'neutral'}>
              {d.status}
            </Badge>
            {isSettled ? (
              <Badge variant="success">Settled</Badge>
            ) : isPartiallyPaid ? (
              <Badge variant="warning">Partially Paid</Badge>
            ) : (
              <Badge variant="warning">Unsettled</Badge>
            )}
          </div>
          <div className={styles.gatePassBillMeta}>
            {`Customer: ${d.customerName} | Commodity: ${d.commodityName} | Bags: ${d.totalBags} (${d.smallBags} Small / ${d.bigBags} Big)`}
          </div>
        </div>
        {canCollect && !isSettled && remainingDue > 0 && onCollectDelivery && (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => onCollectDelivery(d)}
            leftIcon={<IndianRupee size={12} aria-hidden="true" />}
          >
            {`Collect Rent (₹${remainingDue.toLocaleString('en-IN')})`}
          </Button>
        )}
      </div>

      <OutwardRentBreakdown
        hideHeader={true}
        rentType={account.rentType}
        inwardDate={account.inwardDate}
        deliveryDate={d.date}
        smallBags={d.smallBags}
        bigBags={d.bigBags}
        bagType={d.bagType}
        bagCategory={d.bagCategory}
        bagPrice={d.bagPrice}
        seasonalBagPrice={d.seasonalBagPrice}
        monthlyBagPrice={d.monthlyBagPrice}
        seasonalRates={agreedRates}
        monthlyRates={monthlyRates ?? agreedRates}
        totalRent={d.rentCharge ?? 0}
        hamaliRate={hamaliRate}
        excludePeriodKeys={excludePeriodKeys}
        grnNumber={account.grnNumber}
      />

      <div className={styles.gatePassBillFooterSummary}>
        <div className={styles.gatePassBillStat}>
          <span className={styles.gatePassBillStatLabel}>Total Bill Amount</span>
          <strong className={styles.gatePassBillStatValue}>₹{deliveryCharge.toLocaleString('en-IN')}</strong>
        </div>
        <div className={styles.gatePassBillStat}>
          <span className={styles.gatePassBillStatLabel}>Total Paid</span>
          <strong className={styles.gatePassBillStatSuccess}>₹{totalPaid.toLocaleString('en-IN')}</strong>
        </div>
        <div className={styles.gatePassBillStat}>
          <span className={styles.gatePassBillStatLabel}>Balance Due</span>
          <strong className={remainingDue > 0 ? styles.gatePassBillStatWarning : styles.gatePassBillStatSuccess}>
            ₹{remainingDue.toLocaleString('en-IN')}
          </strong>
        </div>
      </div>

      {linkedPayments.length > 0 && (
        <div className={styles.gatePassLinkedPayments}>
          <span className={styles.gatePassLinkedTitle}>Official Cash Memo Receipt ({linkedPayments.length}):</span>
          {linkedPayments.map((p) => {
            const isDirectMatch =
              p.deliveryId === d.id ||
              (p.challanNumber && p.challanNumber === d.challanNumber) ||
              (p.gpNumber && d.gpNumber && p.gpNumber === d.gpNumber);
            const appliedAmount = isDirectMatch ? p.amountPaid : Math.min(totalPaid, deliveryCharge);
            const isLumpSumReceipt = !isDirectMatch && p.amountPaid > appliedAmount;

            return (
              <div key={p.id} className={styles.gatePassLinkedItem}>
                <div className={styles.gatePassReceiptTag}>
                  <strong className={styles.receiptNumber}>{p.receiptNumber}</strong>
                  <Badge variant={p.paymentMode === 'Cash' ? 'primary' : 'success'}>
                    {p.paymentMode}
                  </Badge>
                  <span>• {new Date(p.paymentDate).toLocaleDateString('en-IN')}</span>
                  <span>• Received by {formatReceivedBy(p.createdBy)}</span>
                  {p.notes && <span>• {p.notes}</span>}
                </div>
                <div className={styles.gatePassReceiptActions}>
                  <div className={styles.receiptAmountBlock}>
                    <strong className={styles.paymentAmount}>
                      {isLumpSumReceipt
                        ? `Applied: ₹${appliedAmount.toLocaleString('en-IN')}`
                        : `₹${appliedAmount.toLocaleString('en-IN')}`}
                    </strong>
                    {isLumpSumReceipt && (
                      <span className={styles.receiptTotalMeta}>
                        (Receipt Total: ₹{p.amountPaid.toLocaleString('en-IN')})
                      </span>
                    )}
                  </div>
                  {canPrint && onPrintReceipt && (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => onPrintReceipt(p.receiptNumber)}
                      disabled={printingReceiptNum === p.receiptNumber}
                      isLoading={printingReceiptNum === p.receiptNumber}
                      title="Print Official Cash Memo"
                      leftIcon={<Printer size={12} aria-hidden="true" />}
                    >
                      Print
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

