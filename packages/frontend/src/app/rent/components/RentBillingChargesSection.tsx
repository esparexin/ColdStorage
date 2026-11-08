'use client';

import React, { useMemo } from 'react';
import {
  toExcludedPeriodKeys,
  type DeliveryChallan,
  type RentExtension,
  type RentSummaryDto,
} from '@cold-storage/contracts';
import { DataTable, FeedbackStates, type DataTableColumn } from '@/components/ui';
import { useCommodityRates } from '@/app/commodities/hooks/useCommodityRates';
import { deriveHamaliChargeFromSummary } from '../hooks/rentDisplay.helper';
import { useGrnDeliveries } from '../hooks/useGrnDeliveries';
import {
  buildRentCalculationRows,
  resolveBillingHamaliRate,
  resolveBillingOutwardRates,
  type RentCalculationRow,
} from '../hooks/rentBillingCharges.helper';
import { GatePassRentBillCard } from './GatePassRentBillCard';
import styles from '../page.module.css';

export interface RentBillingChargesSectionProps {
  account: RentSummaryDto;
  selectedDeliveryId?: string;
  originSeason: number;
  periodLabel: (ext: RentExtension) => string;
  canCollect?: boolean;
  onCollectDelivery?: (delivery: DeliveryChallan) => void;
  canPrint?: boolean;
  printingReceiptNum?: string | null;
  onPrintReceipt?: (receiptNumber: string) => void;
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
  selectedDeliveryId,
  originSeason,
  periodLabel: _periodLabel,
  canCollect,
  onCollectDelivery,
  canPrint,
  printingReceiptNum,
  onPrintReceipt,
}: RentBillingChargesSectionProps) {
  const { deliveries, loading } = useGrnDeliveries(account.facilityId, account.grnId);
  const activeDeliveries = useMemo(() => {
    const valid = deliveries
      .filter((d) => d.status !== 'REVERSED')
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    if (selectedDeliveryId) {
      const match = valid.filter((d) => d.id === selectedDeliveryId);
      if (match.length > 0) return match;
    }
    return valid;
  }, [deliveries, selectedDeliveryId]);

  const { rates: commodityRates, hamaliRate: commodityHamaliRate } = useCommodityRates(account.commodityId ?? null);
  const activeCommodityRate = useMemo(() => {
    const targetType = account.rentType === 'Monthly' ? 'Monthly' : 'Seasonal';
    return (
      commodityRates.find((r) => r.rentType === targetType && r.isActive) ??
      commodityRates.find((r) => r.isActive) ??
      commodityRates[0] ??
      null
    );
  }, [commodityRates, account.rentType]);

  const monthlyCommodityRate = useMemo(
    () => commodityRates.find((r) => r.rentType === 'Monthly' && r.isActive) ?? activeCommodityRate,
    [commodityRates, activeCommodityRate],
  );

  const excludePeriodKeys = useMemo(
    () => toExcludedPeriodKeys(account.extensions ?? []),
    [account.extensions],
  );

  const agreedRates = useMemo(
    () => resolveBillingOutwardRates(account, activeCommodityRate),
    [account, activeCommodityRate],
  );

  const monthlyRates = useMemo(
    () => (monthlyCommodityRate ? { small: monthlyCommodityRate.smallRate, big: monthlyCommodityRate.bigRate } : agreedRates),
    [monthlyCommodityRate, agreedRates],
  );

  const hamaliRate = useMemo(
    () => resolveBillingHamaliRate(account, { hamaliRate: commodityHamaliRate ?? activeCommodityRate?.hamaliRate }),
    [account, commodityHamaliRate, activeCommodityRate],
  );

  const hamaliDue = deriveHamaliChargeFromSummary(
    account.totalDue,
    account.rentAmount,
    account.extensions,
    account.hamaliShare,
  );
  const outwardCharges = account.outwardRentCharges ?? 0;
  const isBilledAtOutward =
    outwardCharges > 0 || activeDeliveries.length > 0 || (account.deliveredBags ?? 0) > 0;
  const effectiveStorageAmount = isBilledAtOutward ? outwardCharges : account.rentAmount;

  const storageRentTotal =
    effectiveStorageAmount + account.extensions.reduce((sum, e) => sum + e.finalAmount, 0);

  const rows: RentCalculationRow[] = useMemo(() => {
    if (isBilledAtOutward) return [];
    return buildRentCalculationRows({
      account,
      originSeason,
      effectiveStorageAmount,
      excludePeriodKeys,
      hamaliDue,
    });
  }, [isBilledAtOutward, account, originSeason, effectiveStorageAmount, excludePeriodKeys, hamaliDue]);

  return (
    <>
      {isBilledAtOutward ? (
        <div className={styles.billingSection}>
          {loading ? (
            <FeedbackStates.Loading label="Loading outward rent bills..." />
          ) : activeDeliveries.length === 0 ? (
            <FeedbackStates.Empty message="No outward transactions recorded for this lot yet. Each outward gate pass will generate an independent rent bill upon dispatch." />
          ) : (
            <div className={styles.gatePassBillsList}>
              {activeDeliveries.map((d, idx) => (
                <GatePassRentBillCard
                  key={d.id}
                  delivery={d}
                  index={idx}
                  account={account}
                  agreedRates={agreedRates}
                  monthlyRates={monthlyRates}
                  hamaliRate={hamaliRate}
                  excludePeriodKeys={excludePeriodKeys}
                  canCollect={canCollect}
                  onCollectDelivery={onCollectDelivery}
                  canPrint={canPrint}
                  printingReceiptNum={printingReceiptNum}
                  onPrintReceipt={onPrintReceipt}
                />
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className={styles.billingSection}>
          <div className={styles.billingHeader}>
            <span className={styles.billingTitle}>Rent Calculation Breakdown</span>
            <span className={styles.billingStructureBadge}>{account.rentType}</span>
          </div>

          <DataTable<RentCalculationRow>
            columns={calculationColumns}
            rows={rows}
            rowKey={(r) => r.id}
            caption="Itemized storage rent and extensions calculation"
          />

          <div className={styles.billingTotalRow}>
            <span className={styles.billingTotalLabel}>Total Rent Payable</span>
            <span className={styles.billingTotalAmount}>
              ₹{storageRentTotal.toLocaleString('en-IN')}
            </span>
          </div>
        </div>
      )}
    </>
  );
}
