'use client';

/**
 * Operational Dashboard Page — P7 primary consumer.
 * Coordinator shell routing facility context into dedicated dashboard widgets.
 */

import React from 'react';
import { useRouter } from 'next/navigation';
import { ArrowUpRight, BookOpen, Plus, Receipt } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { FeedbackStates } from '@/components/ui/FeedbackStates';
import { EMPTY_MESSAGES, ERROR_TITLES, LOADING_LABELS } from '@/components/ui/stateCopy';
import { useFacility } from '@/context/FacilityContext';
import { ChamberStockSection } from './components/dashboard/ChamberStockSection';
import { CommodityStockSection } from './components/dashboard/CommodityStockSection';
import { KpiGrid } from './components/dashboard/KpiGrid';
import { RecentActivitySection } from './components/dashboard/RecentActivitySection';
import { useDashboardSummary } from './hooks/useDashboardSummary';
import styles from './page.module.css';

export default function DashboardPage() {
  const router = useRouter();
  const { selectedFacilityId, availableFacilities } = useFacility();
  const { summary, loading, error, refetch } = useDashboardSummary(selectedFacilityId);

  if (loading) return <FeedbackStates.Loading label={LOADING_LABELS.dashboard} />;
  if (error)
    return (
      <FeedbackStates.Error
        title={ERROR_TITLES.default}
        message={error}
        onRetry={() => void refetch()}
      />
    );
  if (!summary) return <FeedbackStates.Empty message={EMPTY_MESSAGES.dashboard} />;

  const facilityName =
    availableFacilities.find((f) => f.id === summary.facilityId)?.name ?? summary.facilityId;

  const monthLabel = new Date().toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    month: 'long',
    year: 'numeric',
  });

  return (
    <div className={styles.page}>
      <div className={styles.headerRow}>
        <div className={styles.titleArea}>
          <h1 className={styles.pageTitle}>Operational Dashboard</h1>
          <p className={styles.pageSub}>
            {facilityName} &nbsp;·&nbsp; {monthLabel}
          </p>
        </div>
        <div className={styles.headerActions}>
          <Button
            variant="primary"
            size="sm"
            leftIcon={<Plus size={15} />}
            onClick={() => router.push('/grns')}
          >
            Inward of Goods
          </Button>
          <Button
            variant="secondary"
            size="sm"
            leftIcon={<ArrowUpRight size={15} />}
            onClick={() => router.push('/deliveries')}
          >
            Outward of Goods
          </Button>
          <Button
            variant="secondary"
            size="sm"
            leftIcon={<BookOpen size={15} />}
            onClick={() => router.push('/bond-ledger')}
          >
            Bond Ledger
          </Button>
          <Button
            variant="secondary"
            size="sm"
            leftIcon={<Receipt size={15} />}
            onClick={() => router.push('/rent')}
          >
            Rent Billing
          </Button>
        </div>
      </div>

      <KpiGrid summary={summary} />
      <ChamberStockSection items={summary.chamberStock} />
      <CommodityStockSection
        items={summary.commodityBreakdown}
        totalOccupied={summary.totalStockBags}
      />
      <RecentActivitySection items={summary.recentActivity} />
    </div>
  );
}
