'use client';

import React from 'react';
import { Download } from 'lucide-react';
import { Button } from '@/components/ui';
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
        <p className={styles.mutedNote}>
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
            <Button
              variant="secondary"
              size="sm"
              onClick={() => onExport('customers', `customers-${selectedFacilityId}.csv`)}
              disabled={exportingType === 'customers'}
              isLoading={exportingType === 'customers'}
              leftIcon={<Download size={13} aria-hidden="true" />}
            >
              {exportingType === 'customers' ? 'Exporting...' : 'Export CSV'}
            </Button>
          </div>

          <div className={styles.exportCard}>
            <div className={styles.exportInfo}>
              <span className={styles.exportTitle}>Inward Goods Receipt Notes</span>
              <span className={styles.exportSub}>
                All GRN records, bag accounting, weighbridge weights, and rent structures.
              </span>
            </div>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => onExport('grns', `grns-${selectedFacilityId}.csv`)}
              disabled={exportingType === 'grns'}
              isLoading={exportingType === 'grns'}
              leftIcon={<Download size={13} aria-hidden="true" />}
            >
              {exportingType === 'grns' ? 'Exporting...' : 'Export CSV'}
            </Button>
          </div>

          <div className={styles.exportCard}>
            <div className={styles.exportInfo}>
              <span className={styles.exportTitle}>Outward Delivery Challans</span>
              <span className={styles.exportSub}>
                Issued challans, dispatched quantities, vehicles, and status events.
              </span>
            </div>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => onExport('deliveries', `deliveries-${selectedFacilityId}.csv`)}
              disabled={exportingType === 'deliveries'}
              isLoading={exportingType === 'deliveries'}
              leftIcon={<Download size={13} aria-hidden="true" />}
            >
              {exportingType === 'deliveries' ? 'Exporting...' : 'Export CSV'}
            </Button>
          </div>

          <div className={styles.exportCard}>
            <div className={styles.exportInfo}>
              <span className={styles.exportTitle}>Live Stock Summary</span>
              <span className={styles.exportSub}>
                Aggregated stock bag quantities categorized by commodity and chamber.
              </span>
            </div>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => onExport('stock-summary', `stock-summary-${selectedFacilityId}.csv`)}
              disabled={exportingType === 'stock-summary'}
              isLoading={exportingType === 'stock-summary'}
              leftIcon={<Download size={13} aria-hidden="true" />}
            >
              {exportingType === 'stock-summary' ? 'Exporting...' : 'Export CSV'}
            </Button>
          </div>

          <div className={styles.exportCard}>
            <div className={styles.exportInfo}>
              <span className={styles.exportTitle}>Immutable Stock Ledger</span>
              <span className={styles.exportSub}>
                Full transaction audit trail (Put-Aways, Deliveries, Reversals).
              </span>
            </div>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => onExport('inventory-ledger', `ledger-${selectedFacilityId}.csv`)}
              disabled={exportingType === 'inventory-ledger'}
              isLoading={exportingType === 'inventory-ledger'}
              leftIcon={<Download size={13} aria-hidden="true" />}
            >
              {exportingType === 'inventory-ledger' ? 'Exporting...' : 'Export CSV'}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
