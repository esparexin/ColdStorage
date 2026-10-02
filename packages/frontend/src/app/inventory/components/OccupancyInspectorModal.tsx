'use client';

import React from 'react';
import { X } from 'lucide-react';
import type { PositionOccupancy } from '@cold-storage/contracts';
import styles from '../page.module.css';

interface OccupancyInspectorModalProps {
  occupancy: PositionOccupancy;
  onClose: () => void;
}

export function OccupancyInspectorModal({
  occupancy,
  onClose,
}: OccupancyInspectorModalProps) {
  return (
    <div
      className={styles.modalBackdrop}
      role="dialog"
      aria-modal="true"
      aria-labelledby="occupancy-modal-title"
    >
      <div className={styles.modalCard}>
        <div className={styles.modalHeader}>
          <h2 id="occupancy-modal-title" className={styles.modalTitle}>
            Position Occupancy: {occupancy.code}
          </h2>
          <button
            type="button"
            className={styles.modalClose}
            onClick={onClose}
          >
            <X size={20} aria-hidden="true" />
          </button>
        </div>

        <div className={styles.modalBody}>
          <div className={styles.detailGrid}>
            <div className={styles.detailItem}>
              <span className={styles.detailLabel}>Capacity</span>
              <span className={styles.detailValue}>
                {occupancy.capacityBags.toLocaleString('en-IN')} Bags
              </span>
            </div>
            <div className={styles.detailItem}>
              <span className={styles.detailLabel}>Occupied</span>
              <span className={styles.detailValue}>
                {occupancy.occupiedBags.toLocaleString('en-IN')} Bags
              </span>
            </div>
            <div className={styles.detailItem}>
              <span className={styles.detailLabel}>Available</span>
              <span className={styles.detailValue}>
                {occupancy.availableBags.toLocaleString('en-IN')} Bags
              </span>
            </div>
            <div className={styles.detailItem}>
              <span className={styles.detailLabel}>Utilization Rate</span>
              <span className={styles.detailValue}>
                {occupancy.utilizationRate.toFixed(1)}%
              </span>
            </div>
          </div>

          <h4 style={{ fontSize: 'var(--text-xs)', fontWeight: 700, textTransform: 'uppercase', marginTop: 'var(--space-4)' }}>
            Stored Lots ({occupancy.storedLots.length})
          </h4>
          {occupancy.storedLots.length === 0 ? (
            <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
              Position is currently empty.
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
              {occupancy.storedLots.map((lot) => (
                <div
                  key={lot.grnId}
                  style={{
                    padding: 'var(--space-2) var(--space-3)',
                    background: 'var(--color-surface-2)',
                    borderRadius: 'var(--radius-md)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    fontSize: 'var(--text-xs)',
                  }}
                >
                  <div>
                    <span style={{ fontWeight: 600 }}>{lot.grnNumber}</span> —{' '}
                    <span>Type: {lot.bagType}</span>
                  </div>
                  <span style={{ fontWeight: 700 }}>
                    {lot.bags.toLocaleString('en-IN')} bags
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className={styles.modalFooter}>
          <button
            type="button"
            className={styles.cancelBtn}
            onClick={onClose}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
