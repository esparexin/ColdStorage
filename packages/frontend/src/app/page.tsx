'use client';

/**
 * Operational Dashboard Page — P7 primary consumer.
 *
 * Fetches: GET /api/facilities/:facilityId/dashboard/summary
 * Displays: KPI cards, chamber utilization, commodity stock, recent activity.
 *
 * No business logic. All values are derived server-side by DashboardService.
 * This page is presentation state only.
 */

import {
  Activity,
  AlertTriangle,
  Archive,
  BarChart3,
  Box,
  CheckCircle2,
  Package,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import type {
  ChamberUtilization,
  CommodityStock,
  DashboardSummary,
  RecentActivityItem,
} from '@cold-storage/contracts';
import { DataTable, type DataTableColumn } from '@/components/ui/DataTable';
import { FeedbackStates } from '@/components/ui/FeedbackStates';
import { useFacility } from '@/context/FacilityContext';
import { requestWithAuth } from '@/lib/api-client';
import styles from './page.module.css';

// ---------------------------------------------------------------------------
// KPI Card
// ---------------------------------------------------------------------------

interface KpiCardProps {
  label: string;
  value: string | number;
  sub?: string;
  icon: React.ElementType;
  accent?: 'primary' | 'success' | 'warning' | 'danger';
}

function KpiCard({ label, value, sub, icon: Icon, accent = 'primary' }: KpiCardProps) {
  return (
    <article className={`${styles.kpiCard} ${styles[accent]}`}>
      <div className={styles.kpiIcon}>
        <Icon size={20} aria-hidden="true" />
      </div>
      <div className={styles.kpiBody}>
        <span className={styles.kpiValue}>{value}</span>
        <span className={styles.kpiLabel}>{label}</span>
        {sub && <span className={styles.kpiSub}>{sub}</span>}
      </div>
    </article>
  );
}

// ---------------------------------------------------------------------------
// Utilization bar
// ---------------------------------------------------------------------------

function UtilizationBar({ rate, isActive }: { rate: number; isActive: boolean }) {
  const color =
    !isActive ? 'var(--color-inactive)'
    : rate >= 90 ? 'var(--color-danger)'
    : rate >= 70 ? 'var(--color-warning)'
    : 'var(--color-success)';

  return (
    <div className={styles.utilBar} role="meter" aria-valuenow={rate} aria-valuemin={0} aria-valuemax={100} aria-label={`${rate}% utilization`}>
      <div className={styles.utilFill} style={{ width: `${Math.min(rate, 100)}%`, background: color }} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Dashboard Page
// ---------------------------------------------------------------------------

export default function DashboardPage() {
  const { selectedFacilityId } = useFacility();
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSummary = useCallback(async () => {
    if (!selectedFacilityId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await requestWithAuth(
        `/api/facilities/${selectedFacilityId}/dashboard/summary`,
      );
      if (!res.ok) {
        const err = (await res.json()) as { error?: string };
        throw new Error(err.error ?? `HTTP ${res.status}`);
      }
      const data = (await res.json()) as { summary: DashboardSummary };
      setSummary(data.summary);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load dashboard');
    } finally {
      setLoading(false);
    }
  }, [selectedFacilityId]);

  useEffect(() => {
    void fetchSummary();
  }, [fetchSummary]);

  if (loading) return <FeedbackStates.Loading label="Loading dashboard…" />;
  if (error) return <FeedbackStates.Error message={error} onRetry={() => void fetchSummary()} />;
  if (!summary) return <FeedbackStates.Empty message="No dashboard data available." />;

  // ---------------------------------------------------------------------------
  // Chamber utilization table columns
  // ---------------------------------------------------------------------------
  const chamberColumns: DataTableColumn<ChamberUtilization>[] = [
    {
      key: 'chamber',
      header: 'Chamber',
      render: (row) => (
        <span className={styles.chamberLabel}>
          {row.chamberNumber}
          {!row.isActive && (
            <span className={styles.inactiveBadge} title="Inactive chamber">
              INACTIVE
            </span>
          )}
        </span>
      ),
    },
    {
      key: 'capacity',
      header: 'Capacity',
      render: (row) => row.capacityBags.toLocaleString('en-IN'),
      align: 'right',
    },
    {
      key: 'occupied',
      header: 'Occupied',
      render: (row) => row.occupiedBags.toLocaleString('en-IN'),
      align: 'right',
    },
    {
      key: 'available',
      header: 'Available',
      render: (row) => row.availableBags.toLocaleString('en-IN'),
      align: 'right',
    },
    {
      key: 'utilization',
      header: 'Utilization',
      render: (row) => (
        <div className={styles.utilCell}>
          <UtilizationBar rate={row.utilizationRate} isActive={row.isActive} />
          <span className={styles.utilPct}>{row.utilizationRate.toFixed(1)}%</span>
        </div>
      ),
    },
  ];

  // ---------------------------------------------------------------------------
  // Commodity stock table columns
  // ---------------------------------------------------------------------------
  const commodityColumns: DataTableColumn<CommodityStock>[] = [
    {
      key: 'name',
      header: 'Commodity',
      render: (row) => row.commodityName,
    },
    {
      key: 'bags',
      header: 'Bags in Storage',
      render: (row) => row.totalBags.toLocaleString('en-IN'),
      align: 'right',
    },
    {
      key: 'share',
      header: 'Share of Stock',
      render: (row) => {
        const pct =
          summary.occupiedBags > 0
            ? Math.round((row.totalBags / summary.occupiedBags) * 100)
            : 0;
        return `${pct}%`;
      },
      align: 'right',
    },
  ];

  // ---------------------------------------------------------------------------
  // Recent activity table columns
  // ---------------------------------------------------------------------------

  const activityTypeLabel: Record<string, string> = {
    INWARD_PUTAWAY: 'Put Away',
    OUTWARD_DELIVERY: 'Delivery',
    DELIVERY_REVERSAL: 'Reversal',
  };

  const activityTypeAccent: Record<string, string> = {
    INWARD_PUTAWAY: styles.typeInward,
    OUTWARD_DELIVERY: styles.typeOutward,
    DELIVERY_REVERSAL: styles.typeReversal,
  };

  const activityColumns: DataTableColumn<RecentActivityItem>[] = [
    {
      key: 'type',
      header: 'Type',
      render: (row) => (
        <span className={`${styles.typeBadge} ${activityTypeAccent[row.type] ?? ''}`}>
          {activityTypeLabel[row.type] ?? row.type}
        </span>
      ),
    },
    {
      key: 'reference',
      header: 'Reference',
      render: (row) => <code className={styles.refCode}>{row.referenceNumber}</code>,
    },
    {
      key: 'position',
      header: 'Position',
      render: (row) => <code className={styles.refCode}>{row.positionCode}</code>,
    },
    {
      key: 'bags',
      header: 'Bags',
      render: (row) => row.bags.toLocaleString('en-IN'),
      align: 'right',
    },
    {
      key: 'date',
      header: 'Date',
      render: (row) =>
        new Date(row.date).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'short', timeStyle: 'short' }),
      align: 'right',
    },
  ];

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  const monthLabel = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', month: 'long', year: 'numeric' });

  return (
    <div className={styles.page}>
      <h1 className={styles.pageTitle}>Operational Dashboard</h1>
      <p className={styles.pageSub}>Facility: {summary.facilityId} &nbsp;·&nbsp; {monthLabel}</p>

      {/* KPI Grid */}
      <section className={styles.kpiGrid} aria-label="Key performance indicators">
        <KpiCard
          label="Stored Bags"
          value={summary.occupiedBags.toLocaleString('en-IN')}
          sub={`of ${summary.totalCapacityBags.toLocaleString('en-IN')} capacity`}
          icon={Archive}
          accent="primary"
        />
        <KpiCard
          label="Utilization"
          value={`${summary.utilizationRate.toFixed(1)}%`}
          sub={`${summary.availableBags.toLocaleString('en-IN')} bags available`}
          icon={BarChart3}
          accent={summary.utilizationRate >= 90 ? 'danger' : summary.utilizationRate >= 70 ? 'warning' : 'success'}
        />
        <KpiCard
          label="Monthly Inward"
          value={summary.monthlyInwardBags.toLocaleString('en-IN')}
          sub="bags received this month"
          icon={TrendingUp}
          accent="success"
        />
        <KpiCard
          label="Monthly Delivered"
          value={summary.monthlyDeliveredBags.toLocaleString('en-IN')}
          sub="net bags delivered this month"
          icon={TrendingDown}
          accent="warning"
        />
        <KpiCard
          label="Open GRNs"
          value={summary.activeGrns}
          sub="active inward receipts"
          icon={Box}
          accent="primary"
        />
        <KpiCard
          label="Closed GRNs"
          value={summary.closedGrns}
          sub="completed receipts"
          icon={CheckCircle2}
          accent="success"
        />
      </section>

      {/* Chamber Utilization */}
      <section className={styles.section} aria-label="Chamber utilization">
        <h2 className={styles.sectionTitle}>
          <AlertTriangle size={18} aria-hidden="true" />
          Chamber Utilization
        </h2>
        <DataTable
          columns={chamberColumns}
          rows={summary.chamberUtilization}
          rowKey={(row) => row.chamberId}
          caption="Chamber utilization breakdown"
        />
      </section>

      {/* Commodity Breakdown */}
      <section className={styles.section} aria-label="Commodity stock breakdown">
        <h2 className={styles.sectionTitle}>
          <Package size={18} aria-hidden="true" />
          Commodity Stock
        </h2>
        {summary.commodityBreakdown.length === 0 ? (
          <FeedbackStates.Empty message="No commodity stock on hand." />
        ) : (
          <DataTable
            columns={commodityColumns}
            rows={summary.commodityBreakdown}
            rowKey={(row) => row.commodityId}
            caption="Current commodity stock"
          />
        )}
      </section>

      {/* Recent Activity */}
      <section className={styles.section} aria-label="Recent activity">
        <h2 className={styles.sectionTitle}>
          <Activity size={18} aria-hidden="true" />
          Recent Activity
        </h2>
        {summary.recentActivity.length === 0 ? (
          <FeedbackStates.Empty message="No recent activity." />
        ) : (
          <DataTable
            columns={activityColumns}
            rows={summary.recentActivity}
            rowKey={(row) => row.id}
            caption="Latest 10 inventory transactions"
          />
        )}
      </section>
    </div>
  );
}
