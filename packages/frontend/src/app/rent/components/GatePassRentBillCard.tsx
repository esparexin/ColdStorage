'use client';

import React from 'react';
import { IndianRupee } from 'lucide-react';
import type { DeliveryChallan, RentSummaryDto } from '@cold-storage/contracts';
import { Badge, Button } from '@/components/ui';
import { OutwardRentBreakdown } from '@/app/deliveries/components/OutwardRentBreakdown';
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
}: GatePassRentBillCardProps) {
  const remainingDue = d.rentRemainingBalance ?? d.rentCharge ?? 0;
  const totalPaid = d.rentTotalPaid ?? 0;

  return (
    <div className={styles.gatePassBillCard}>
      <div className={styles.gatePassBillHeader}>
        <div className={styles.gatePassBillTitle}>
          <div className={styles.gatePassBillName}>
            <strong>{`RENT BILL #${idx + 1}: Gate Pass ${d.challanNumber}${d.gpNumber ? ` (${d.gpNumber})` : ''} · ${new Date(d.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}`}</strong>
            <Badge variant={d.status === 'ISSUED' ? 'success' : 'neutral'}>
              {d.status}
            </Badge>
            {remainingDue <= 0 && totalPaid > 0 ? (
              <Badge variant="success">Settled</Badge>
            ) : totalPaid > 0 ? (
              <Badge variant="warning">Partially Paid</Badge>
            ) : (
              <Badge variant="warning">Unsettled</Badge>
            )}
          </div>
          <div className={styles.gatePassBillMeta}>
            {`Customer: ${d.customerName} | Commodity: ${d.commodityName} | Bags: ${d.totalBags} (${d.smallBags} Small / ${d.bigBags} Big)`}
          </div>
        </div>
        {canCollect && remainingDue > 0 && onCollectDelivery && (
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
    </div>
  );
}

