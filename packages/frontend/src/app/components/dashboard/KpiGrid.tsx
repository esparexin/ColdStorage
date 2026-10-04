'use client';

import React from 'react';
import type { DashboardSummary } from '@cold-storage/contracts';
import { StatCard, StatGrid } from '@/components/ui';

export function KpiGrid({ summary }: { summary: DashboardSummary }) {
  return (
    <StatGrid label="Key performance indicators" minTileWidth={180}>
      <StatCard
        label="Stock on Hand"
        value={summary.totalStockBags.toLocaleString('en-IN')}
        sub="bags currently stored"
        accent="primary"
      />
      <StatCard
        label="Chambers in Use"
        value={summary.chamberStock.length}
        sub="chamber labels holding stock"
        accent="primary"
      />
      <StatCard
        label="Monthly Inward"
        value={summary.monthlyInwardBags.toLocaleString('en-IN')}
        sub="bags received this month"
        accent="success"
      />
      <StatCard
        label="Monthly Delivered"
        value={summary.monthlyDeliveredBags.toLocaleString('en-IN')}
        sub="net bags delivered this month"
        accent="warning"
      />
      <StatCard
        label="Open GRNs"
        value={summary.activeGrns}
        sub="active inward receipts"
        accent="primary"
      />
      <StatCard
        label="Closed GRNs"
        value={summary.closedGrns}
        sub="completed receipts"
        accent="success"
      />
    </StatGrid>
  );
}