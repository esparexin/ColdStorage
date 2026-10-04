'use client';

import React from 'react';
import { StatCard, StatGrid } from '@/components/ui';

interface RentKpiCardsProps {
  metrics: {
    totalBilled: number;
    totalCollected: number;
    totalOutstanding: number;
  };
}

export function RentKpiCards({ metrics }: RentKpiCardsProps) {
  return (
    <StatGrid label="Rent billing key metrics" minTileWidth={180}>
      <StatCard
        label="Total Rent Billed"
        value={`₹${metrics.totalBilled.toLocaleString('en-IN')}`}
        sub="Contractual obligations"
        accent="primary"
      />
      <StatCard
        label="Total Rent Collected"
        value={`₹${metrics.totalCollected.toLocaleString('en-IN')}`}
        sub="Realized payments received"
        accent="success"
        accentValue
      />
      <StatCard
        label="Outstanding Dues"
        value={`₹${metrics.totalOutstanding.toLocaleString('en-IN')}`}
        sub="Pending balance to be collected"
        accent="warning"
        accentValue
      />
    </StatGrid>
  );
}