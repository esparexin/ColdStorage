'use client';

import React from 'react';
import type { DashboardSummary } from '@cold-storage/contracts';
import { StatCard, StatGrid } from '@/components/ui';

export function KpiGrid({ summary }: { summary: DashboardSummary }) {
  return (
    <StatGrid label="Key performance indicators">
      <StatCard
        label="Stock on Hand"
        value={`${summary.totalStockBags.toLocaleString('en-IN')} bags`}
      />
      <StatCard
        label="Monthly Inward"
        value={`${summary.monthlyInwardBags.toLocaleString('en-IN')} bags`}
        accent="success"
      />
      <StatCard
        label="Monthly Delivered"
        value={`${summary.monthlyDeliveredBags.toLocaleString('en-IN')} bags`}
        accent="primary"
      />
      <StatCard label="Open GRNs" value={summary.activeGrns} accent="warning" />
      <StatCard label="Closed GRNs" value={summary.closedGrns} />
    </StatGrid>
  );
}