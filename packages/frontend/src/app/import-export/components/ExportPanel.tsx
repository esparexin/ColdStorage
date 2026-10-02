'use client';

import React from 'react';
import { Download } from 'lucide-react';
import styles from '../page.module.css';

interface ExportPanelProps {
  canExport: boolean;
  selectedFacilityId: string;
  exportingType: string | null;
  onExport: (endpoint: string, filename: string) => void;
}

export function ExportPanel({
  canExport,
  selectedFacilityId,
  exportingType,
  onExport,
}: ExportPanelProps) {
  return (
    <div className={styles.sectionCard}>
      <div className={styles.sectionHeader}>
        <Download size={18} color="var(--color-primary)" aria-hidden="true" />
        <h2 className={styles.sectionTitle}>Certified CSV Exports</h2>
      </div>

      {!canExport ? (
        <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)' }}>
          Your role does not have authorization to download certified data exports.
        </p>
      ) : (
        <div className={styles.exportList}>
          <div className={styles.exportCard}>
            <div className={styles.exportInfo}>
              <span className={styles.exportTitle}>Customer Directory</span>
              <span className={styles.exportSub}>
                All registered customer accounts, mobile numbers, and GSTIN identifiers.
              </span>
            </div>
            <button
              type="button"
              className={styles.exportBtn}
              onClick={() => onExport('customers', `customers-${selectedFacilityId}.csv`)}
              disabled={exportingType === 'customers'}
            >
              <Download size={13} aria-hidden="true" />
              {exportingType === 'customers' ? 'Exporting...' : 'Export CSV'}
            </button>
          </div>

          <div className={styles.exportCard}>
            <div className={styles.exportInfo}>
              <span className={styles.exportTitle}>Inward Goods Receipt Notes</span>
              <span className={styles.exportSub}>
                All GRN records, bag accounting, weighbridge weights, and rent structures.
              </span>
            </div>
            <button
              type="button"
              className={styles.exportBtn}
              onClick={() => onExport('grns', `grns-${selectedFacilityId}.csv`)}
              disabled={exportingType === 'grns'}
            >
              <Download size={13} aria-hidden="true" />
              {exportingType === 'grns' ? 'Exporting...' : 'Export CSV'}
            </button>
          </div>

          <div className={styles.exportCard}>
            <div className={styles.exportInfo}>
              <span className={styles.exportTitle}>Outward Delivery Challans</span>
              <span className={styles.exportSub}>
                Issued challans, dispatched quantities, vehicles, and status events.
              </span>
            </div>
            <button
              type="button"
              className={styles.exportBtn}
              onClick={() => onExport('deliveries', `deliveries-${selectedFacilityId}.csv`)}
              disabled={exportingType === 'deliveries'}
            >
              <Download size={13} aria-hidden="true" />
              {exportingType === 'deliveries' ? 'Exporting...' : 'Export CSV'}
            </button>
          </div>

          <div className={styles.exportCard}>
            <div className={styles.exportInfo}>
              <span className={styles.exportTitle}>Live Stock Summary</span>
              <span className={styles.exportSub}>
                Aggregated stock bag quantities categorized by commodity and chamber.
              </span>
            </div>
            <button
              type="button"
              className={styles.exportBtn}
              onClick={() => onExport('stock-summary', `stock-summary-${selectedFacilityId}.csv`)}
              disabled={exportingType === 'stock-summary'}
            >
              <Download size={13} aria-hidden="true" />
              {exportingType === 'stock-summary' ? 'Exporting...' : 'Export CSV'}
            </button>
          </div>

          <div className={styles.exportCard}>
            <div className={styles.exportInfo}>
              <span className={styles.exportTitle}>Immutable Stock Ledger</span>
              <span className={styles.exportSub}>
                Full transaction audit trail (Put-Aways, Deliveries, Reversals).
              </span>
            </div>
            <button
              type="button"
              className={styles.exportBtn}
              onClick={() => onExport('inventory-ledger', `ledger-${selectedFacilityId}.csv`)}
              disabled={exportingType === 'inventory-ledger'}
            >
              <Download size={13} aria-hidden="true" />
              {exportingType === 'inventory-ledger' ? 'Exporting...' : 'Export CSV'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
