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

const inr = (amount: number) => `₹${amount.toLocaleString('en-IN')}`;

export function RentKpiCards({ metrics }: RentKpiCardsProps) {
  return (
    <StatGrid label="Rent billing totals">
      <StatCard label="Total Billed" value={inr(metrics.totalBilled)} />
      <StatCard
        label="Total Collected"
        value={inr(metrics.totalCollected)}
        accent="success"
      />
      <StatCard
        label="Outstanding Dues"
        value={inr(metrics.totalOutstanding)}
        accent="warning"
      />
    </StatGrid>
  );
}