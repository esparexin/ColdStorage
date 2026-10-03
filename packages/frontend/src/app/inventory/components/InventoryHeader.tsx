'use client';

import React from 'react';
import { Archive, Boxes, Clock, Package, Warehouse } from 'lucide-react';
import type { FacilityInventorySummary, Grn } from '@cold-storage/contracts';
import styles from '../page.module.css';

interface InventoryHeaderProps {
  currentFacilityName: string;
  stockSummary: FacilityInventorySummary | null;
  loadingSummary: boolean;
  openGrns: Grn[];
  activeTab: 'put-away' | 'ledger';
  onTabChange: (tab: 'put-away' | 'ledger') => void;
}

export function InventoryHeader({
  currentFacilityName,
  stockSummary,
  loadingSummary,
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
            Chamber-level stock allocation and an immutable stock audit trail for{' '}
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
            <span className={styles.kpiLabel}>Chambers in Use</span>
            <span className={styles.kpiValue}>{stockSummary?.byChamber.length ?? 0}</span>
            <span className={styles.kpiSub}>
              {stockSummary?.byChamber.map((c) => `Chamber ${c.chamber}`).join(', ') ||
                'No chambers holding stock'}
            </span>
          </div>
        </div>
      </div>

      <div className={styles.tabsBar} role="tablist" aria-label="Inventory views">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'put-away'}
          className={`${styles.tabBtn} ${activeTab === 'put-away' ? styles.tabBtnActive : ''}`}
          onClick={() => onTabChange('put-away')}
        >
          <Archive size={16} aria-hidden="true" />
          Put-Away Allocations
          {openGrns.length > 0 && <span className={styles.tabBadge}>{openGrns.length}</span>}
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'ledger'}
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
