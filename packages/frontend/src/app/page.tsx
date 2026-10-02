'use client';

/**
 * Operational Dashboard Page — P7 primary consumer.
 * Coordinator shell routing facility context into dedicated dashboard widgets.
 */

import React from 'react';
import { FeedbackStates } from '@/components/ui/FeedbackStates';
import { useFacility } from '@/context/FacilityContext';
import { ChamberUtilizationSection } from './components/dashboard/ChamberUtilizationSection';
import { CommodityStockSection } from './components/dashboard/CommodityStockSection';
import { KpiGrid } from './components/dashboard/KpiGrid';
import { RecentActivitySection } from './components/dashboard/RecentActivitySection';
import { useDashboardSummary } from './hooks/useDashboardSummary';
import styles from './page.module.css';

export default function DashboardPage() {
  const { selectedFacilityId } = useFacility();
  const { summary, loading, error, refetch } = useDashboardSummary(selectedFacilityId);

  if (loading) return <FeedbackStates.Loading label="Loading dashboard…" />;
  if (error) return <FeedbackStates.Error message={error} onRetry={() => void refetch()} />;
  if (!summary) return <FeedbackStates.Empty message="No dashboard data available." />;

  const monthLabel = new Date().toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    month: 'long',
    year: 'numeric',
  });

  return (
    <div className={styles.page}>
      <h1 className={styles.pageTitle}>Operational Dashboard</h1>
      <p className={styles.pageSub}>
        Facility: {summary.facilityId} &nbsp;·&nbsp; {monthLabel}
      </p>

      <KpiGrid summary={summary} />
      <ChamberUtilizationSection items={summary.chamberUtilization} />
      <CommodityStockSection
        items={summary.commodityBreakdown}
        totalOccupied={summary.occupiedBags}
      />
      <RecentActivitySection items={summary.recentActivity} />
    </div>
  );
}
