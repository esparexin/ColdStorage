'use client';

import React from 'react';
import { AlertCircle } from 'lucide-react';
import { FeedbackStates } from '@/components/ui/FeedbackStates';
import type { PositionOccupancy } from '@cold-storage/contracts';
import styles from '../page.module.css';

interface PositionOccupancyPanelProps {
  positionCode: string | undefined;
  occupancy: PositionOccupancy | null;
  loading: boolean;
}

export function PositionOccupancyPanel({
  positionCode,
  occupancy,
  loading,
}: PositionOccupancyPanelProps) {
  if (!positionCode) return null;

  return (
    <div className={styles.occupancySection}>
      <h2>Rack Space Used Details: {positionCode}</h2>
      {loading ? (
        <FeedbackStates.Loading label="Loading occupancy data..." />
      ) : !occupancy ? (
        <FeedbackStates.Empty message="Could not load occupancy information." />
      ) : (
        <div className={styles.occupancyCard}>
          <div className={styles.occupancyStats}>
            <div className={styles.statBox}>
              <span className={styles.statNumber}>{occupancy.capacityBags}</span>
              <span className={styles.statDesc}>Capacity (Bags)</span>
            </div>
            <div className={styles.statBox}>
              <span className={styles.statNumber}>{occupancy.occupiedBags}</span>
              <span className={styles.statDesc}>Occupied (Bags)</span>
            </div>
            <div className={styles.statBox}>
              <span className={styles.statNumber}>{occupancy.availableBags}</span>
              <span className={styles.statDesc}>Available (Bags)</span>
            </div>
            <div className={styles.statBox}>
              <span className={styles.statNumber}>
                {Math.round((occupancy.occupiedBags / (occupancy.capacityBags || 1)) * 100)}%
              </span>
              <span className={styles.statDesc}>Utilization</span>
            </div>
          </div>

          <h3 className={styles.lotsTitle}>Stored Lots & Associated Inward GRNs</h3>
          {occupancy.storedLots.length === 0 ? (
            <div className={styles.emptyLots}>
              <AlertCircle size={16} />
              <span>This rack space is currently empty.</span>
            </div>
          ) : (
            <div className={styles.lotsTableWrapper}>
              <table className={styles.lotsTable}>
                <thead>
                  <tr>
                    <th>GRN #</th>
                    <th>Bag Type</th>
                    <th style={{ textAlign: 'right' }}>Bags</th>
                  </tr>
                </thead>
                <tbody>
                  {occupancy.storedLots.map((lot, idx) => (
                    <tr key={`${lot.grnId}-${idx}`}>
                      <td>
                        <strong>{lot.grnNumber}</strong>
                      </td>
                      <td>{lot.bagType}</td>
                      <td style={{ textAlign: 'right' }}>
                        <strong>{lot.bags.toLocaleString('en-IN')}</strong>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
