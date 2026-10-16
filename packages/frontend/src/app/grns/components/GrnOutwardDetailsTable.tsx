'use client';

import React, { useEffect, useState } from 'react';
import type { DeliveryChallan, Grn } from '@cold-storage/contracts';
import { Badge, DataTable, type DataTableColumn } from '@/components/ui';
import { requestWithAuth } from '@/lib/api-client';
import { formatDisplayDate } from '@/lib/date-format';
import styles from './GrnMergedDetailsTable.module.css';

export interface GrnOutwardDetailsTableProps {
  currentGrn: Grn;
}

const columns: DataTableColumn<DeliveryChallan>[] = [
  {
    key: 'challanNumber',
    header: 'Challan # / GP',
    render: (row) => (
      <div>
        <span className={`${styles.primaryText} ${styles.tabularNum}`}>{row.challanNumber}</span>
        {row.gpNumber && <span className={styles.subText}>GP: {row.gpNumber}</span>}
      </div>
    ),
  },
  {
    key: 'date',
    header: 'Outward Date',
    render: (row) => (
      <span className={styles.subText} style={{ color: 'var(--color-text-primary)' }}>
        {formatDisplayDate(row.date)}
      </span>
    ),
  },
  {
    key: 'bags',
    header: 'Bags & Composition',
    render: (row) => (
      <div style={{ textAlign: 'right' }}>
        <span className={`${styles.primaryText} ${styles.tabularNum}`}>
          {row.totalBags.toLocaleString('en-IN')} bags
        </span>
        <span className={styles.subText}>
          S: {row.smallBags.toLocaleString('en-IN')} • B: {row.bigBags.toLocaleString('en-IN')}
        </span>
      </div>
    ),
  },
  {
    key: 'status',
    header: 'Status',
    align: 'center',
    render: (row) => (
      <Badge variant={row.status === 'ISSUED' ? 'success' : 'neutral'}>{row.status}</Badge>
    ),
  },
  {
    key: 'vehicle',
    header: 'Vehicle / Driver',
    render: (row) => (
      <div>
        <span className={styles.primaryText}>{row.vehicleNumber || '—'}</span>
        {row.driverName && <span className={styles.subText}>Driver: {row.driverName}</span>}
      </div>
    ),
  },
];

export function GrnOutwardDetailsTable({ currentGrn }: GrnOutwardDetailsTableProps) {
  const [deliveries, setDeliveries] = useState<DeliveryChallan[] | null>(null);

  useEffect(() => {
    let active = true;
    if (!currentGrn.facilityId || !currentGrn.id || (currentGrn.netDeliveredBags ?? 0) <= 0) return;

    requestWithAuth(
      `/api/facilities/${encodeURIComponent(currentGrn.facilityId)}/grns/${encodeURIComponent(currentGrn.id)}/deliveries`,
    )
      .then(async (res) => {
        if (!active) return;
        if (res.ok) {
          const data = (await res.json()) as { deliveries?: DeliveryChallan[] };
          if (Array.isArray(data.deliveries)) {
            setDeliveries(data.deliveries);
          }
        }
      })
      .catch(() => {
        // Silently ignore fetch errors
      });

    return () => {
      active = false;
    };
  }, [currentGrn.facilityId, currentGrn.id, currentGrn.netDeliveredBags]);

  if (!deliveries || deliveries.length === 0) return null;

  return (
    <div className={styles.section}>
      <div className={styles.sectionHeader}>
        <span className={styles.sectionTitle}>Outward Delivery History ({deliveries.length})</span>
      </div>
      <DataTable
        columns={columns}
        rows={deliveries}
        rowKey={(row) => row.id}
        caption="Outward Delivery History"
      />
    </div>
  );
}
