'use client';

import React from 'react';
import type { FacilityInventorySummary } from '@cold-storage/contracts';
import { StatCard, StatGrid } from '@/components/ui';
import styles from '../page.module.css';

interface InventoryHeaderProps {
  stockSummary: FacilityInventorySummary | null;
  loadingSummary: boolean;
  activeTab: 'chambers' | 'ledger';
  onTabChange: (tab: 'chambers' | 'ledger') => void;
}

export function InventoryHeader({
  stockSummary,
  loadingSummary,
  activeTab,
  onTabChange,
}: InventoryHeaderProps) {
  return (
    <>
      <div className={styles.headerRow}>
        <div className={styles.titleArea}>
          <h1 className={styles.pageTitle}>Inventory & Stock Overview</h1>
        </div>
      </div>

      <StatGrid label="Inventory summary" minTileWidth={180}>
        <StatCard
          label="Total Stock in Storage"
          value={`${loadingSummary ? '...' : (stockSummary?.totalStockBags ?? 0).toLocaleString('en-IN')} bags`}
          sub="Active inventory across facility"
          accent="primary"
        />
        <StatCard
          label="Commodities Stored"
          value={loadingSummary ? '...' : (stockSummary?.byCommodity.length ?? 0)}
          sub={
            stockSummary?.byCommodity.map((c) => c.commodityName).join(', ') ||
            'Zero stock recorded'
          }
          accent="primary"
        />
        <StatCard
          label="Chambers in Use"
          value={stockSummary?.byChamber.length ?? 0}
          sub={
            stockSummary?.byChamber.map((c) => `Chamber ${c.chamber}`).join(', ') ||
            'No chambers holding stock'
          }
          accent="primary"
        />
      </StatGrid>

      <div className={styles.tabsBar} role="tablist" aria-label="Inventory views">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'chambers'}
          className={`${styles.tabBtn} ${activeTab === 'chambers' ? styles.tabBtnActive : ''}`}
          onClick={() => onTabChange('chambers')}
        >
          Chamber Stock Distribution
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'ledger'}
          className={`${styles.tabBtn} ${activeTab === 'ledger' ? styles.tabBtnActive : ''}`}
          onClick={() => onTabChange('ledger')}
        >
          Stock Movement Ledger
        </button>
      </div>
    </>
  );
}