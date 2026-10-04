'use client';

import React from 'react';
import { Boxes, Package, Warehouse } from 'lucide-react';
import type { FacilityInventorySummary } from '@cold-storage/contracts';
import { StatCard, StatGrid } from '@/components/ui';
import styles from '../page.module.css';

interface InventoryHeaderProps {
  currentFacilityName: string;
  stockSummary: FacilityInventorySummary | null;
  loadingSummary: boolean;
}

export function InventoryHeader({
  currentFacilityName,
  stockSummary,
  loadingSummary,
}: InventoryHeaderProps) {
  return (
    <>
      <div className={styles.headerRow}>
        <div className={styles.titleArea}>
          <h1 className={styles.pageTitle}>Inventory & Stock Overview</h1>
          <p className={styles.pageSub}>
            Authoritative chamber stock distribution for{' '}
            {currentFacilityName}.
          </p>
        </div>
      </div>

      <StatGrid label="Inventory summary" minTileWidth={240}>
        <StatCard
          label="Total Stock in Storage"
          value={`${loadingSummary ? '...' : (stockSummary?.totalStockBags ?? 0).toLocaleString('en-IN')} bags`}
          sub="Active inventory across facility"
          icon={Package}
          accent="primary"
        />
        <StatCard
          label="Commodities Stored"
          value={loadingSummary ? '...' : (stockSummary?.byCommodity.length ?? 0)}
          sub={
            stockSummary?.byCommodity.map((c) => c.commodityName).join(', ') ||
            'Zero stock recorded'
          }
          icon={Boxes}
          accent="primary"
        />
        <StatCard
          label="Chambers in Use"
          value={stockSummary?.byChamber.length ?? 0}
          sub={
            stockSummary?.byChamber.map((c) => `Chamber ${c.chamber}`).join(', ') ||
            'No chambers holding stock'
          }
          icon={Warehouse}
          accent="primary"
        />
      </StatGrid>
    </>
  );
}