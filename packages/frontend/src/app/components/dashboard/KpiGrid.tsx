'use client';

import React from 'react';
import { Archive, BarChart3, Box, CheckCircle2, TrendingDown, TrendingUp } from 'lucide-react';
import type { DashboardSummary } from '@cold-storage/contracts';
import styles from '@/app/page.module.css';

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

export function KpiGrid({ summary }: { summary: DashboardSummary }) {
  return (
    <section className={styles.kpiGrid} aria-label="Key performance indicators">
      <KpiCard
        label="Stock on Hand"
        value={summary.totalStockBags.toLocaleString('en-IN')}
        sub="bags currently stored"
        icon={Archive}
        accent="primary"
      />
      <KpiCard
        label="Chambers in Use"
        value={summary.chamberStock.length}
        sub="chamber labels holding stock"
        icon={BarChart3}
        accent="primary"
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
  );
}
