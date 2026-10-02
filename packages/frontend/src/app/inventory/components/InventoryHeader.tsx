'use client';

import React from 'react';
import { Archive, Boxes, Clock, Layers, Package, Warehouse } from 'lucide-react';
import type { Chamber, FacilityInventorySummary, Grn } from '@cold-storage/contracts';
import styles from '../page.module.css';

interface InventoryHeaderProps {
  currentFacilityName: string;
  stockSummary: FacilityInventorySummary | null;
  loadingSummary: boolean;
  chambers: Chamber[];
  openGrns: Grn[];
  activeTab: 'put-away' | 'hierarchy' | 'ledger';
  onTabChange: (tab: 'put-away' | 'hierarchy' | 'ledger') => void;
}

export function InventoryHeader({
  currentFacilityName,
  stockSummary,
  loadingSummary,
  chambers,
  openGrns,
  activeTab,
  onTabChange,
}: InventoryHeaderProps) {
  return (
    <>
      <div className={styles.headerRow}>
        <div className={styles.titleArea}>
          <h1 className={styles.pageTitle}>Inventory & Put-Away</h1>
          <p className={styles.pageSub}>
            Storage capacity, position-level rack allocation, and immutable stock audit trail for{' '}
            {currentFacilityName}.
          </p>
        </div>
      </div>

      <div className={styles.kpiGrid}>
        <div className={styles.kpiCard}>
          <div className={styles.kpiIconWrap}>
            <Package size={24} aria-hidden="true" />
          </div>
          <div className={styles.kpiContent}>
            <span className={styles.kpiLabel}>Total Stock in Storage</span>
            <span className={styles.kpiValue}>
              {loadingSummary ? '...' : (stockSummary?.totalStockBags ?? 0).toLocaleString('en-IN')}{' '}
              bags
            </span>
            <span className={styles.kpiSub}>Active inventory across facility</span>
          </div>
        </div>

        <div className={styles.kpiCard}>
          <div className={styles.kpiIconWrap}>
            <Boxes size={24} aria-hidden="true" />
          </div>
          <div className={styles.kpiContent}>
            <span className={styles.kpiLabel}>Commodities Stored</span>
            <span className={styles.kpiValue}>
              {loadingSummary ? '...' : stockSummary?.byCommodity.length ?? 0}
            </span>
            <span className={styles.kpiSub}>
              {stockSummary?.byCommodity.map((c) => c.commodityName).join(', ') ||
                'Zero stock recorded'}
            </span>
          </div>
        </div>

        <div className={styles.kpiCard}>
          <div className={styles.kpiIconWrap}>
            <Warehouse size={24} aria-hidden="true" />
          </div>
          <div className={styles.kpiContent}>
            <span className={styles.kpiLabel}>Active Chambers</span>
            <span className={styles.kpiValue}>{chambers.length}</span>
            <span className={styles.kpiSub}>
              {chambers.map((c) => `Chamber ${c.chamberNumber}`).join(', ') || 'No chambers'}
            </span>
          </div>
        </div>
      </div>

      <div className={styles.tabsBar}>
        <button
          type="button"
          className={`${styles.tabBtn} ${activeTab === 'put-away' ? styles.tabBtnActive : ''}`}
          onClick={() => onTabChange('put-away')}
        >
          <Archive size={16} aria-hidden="true" />
          Put-Away Allocations
          {openGrns.length > 0 && <span className={styles.tabBadge}>{openGrns.length}</span>}
        </button>

        <button
          type="button"
          className={`${styles.tabBtn} ${activeTab === 'hierarchy' ? styles.tabBtnActive : ''}`}
          onClick={() => onTabChange('hierarchy')}
        >
          <Layers size={16} aria-hidden="true" />
          Storage Hierarchy & Capacity Grid
        </button>

        <button
          type="button"
          className={`${styles.tabBtn} ${activeTab === 'ledger' ? styles.tabBtnActive : ''}`}
          onClick={() => onTabChange('ledger')}
        >
          <Clock size={16} aria-hidden="true" />
          Immutable Stock Ledger
        </button>
      </div>
    </>
  );
}
