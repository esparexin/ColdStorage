'use client';

import React from 'react';
import { IndianRupee, Receipt, Wallet } from 'lucide-react';
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
    <StatGrid label="Rent billing key metrics" minTileWidth={220}>
      <StatCard
        label="Total Rent Billed"
        value={`₹${metrics.totalBilled.toLocaleString('en-IN')}`}
        sub="Contractual obligations"
        icon={IndianRupee}
        accent="primary"
      />
      <StatCard
        label="Total Rent Collected"
        value={`₹${metrics.totalCollected.toLocaleString('en-IN')}`}
        sub="Realized payments received"
        icon={Receipt}
        accent="success"
        accentValue
      />
      <StatCard
        label="Outstanding Dues"
        value={`₹${metrics.totalOutstanding.toLocaleString('en-IN')}`}
        sub="Pending balance to be collected"
        icon={Wallet}
        accent="warning"
        accentValue
      />
    </StatGrid>
  );
}