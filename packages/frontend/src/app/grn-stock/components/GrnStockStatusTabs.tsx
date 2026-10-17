'use client';

import type { GrnStatus } from '@cold-storage/contracts';
import { Button } from '@/components/ui';
import styles from './GrnStockStatusTabs.module.css';

export interface GrnStockTabCounts {
  all: number;
  open: number;
  closed: number;
}

interface GrnStockStatusTabsProps {
  statusFilter: '' | GrnStatus;
  onStatusChange: (status: '' | GrnStatus) => void;
  counts: GrnStockTabCounts;
}

export function GrnStockStatusTabs({
  statusFilter,
  onStatusChange,
  counts,
}: GrnStockStatusTabsProps) {
  return (
    <div className={styles.statusTabs} role="tablist" aria-label="Filter by Stock Status">
      <Button
        id="grn-stock-status-tab-all"
        role="tab"
        aria-selected={statusFilter === ''}
        variant={statusFilter === '' ? 'secondary' : 'ghost'}
        size="sm"
        className={`${styles.statusTab} ${statusFilter === '' ? styles.statusTabActive : ''}`}
        onClick={() => onStatusChange('')}
      >
        All{' '}
        <span className={`${styles.tabBadge} ${statusFilter === '' ? styles.tabBadgeActive : ''}`}>
          {counts.all}
        </span>
      </Button>

      <Button
        id="grn-stock-status-tab-open"
        role="tab"
        aria-selected={statusFilter === 'OPEN'}
        variant={statusFilter === 'OPEN' ? 'secondary' : 'ghost'}
        size="sm"
        className={`${styles.statusTab} ${statusFilter === 'OPEN' ? styles.statusTabActive : ''}`}
        onClick={() => onStatusChange('OPEN')}
      >
        Open{' '}
        <span className={`${styles.tabBadge} ${statusFilter === 'OPEN' ? styles.tabBadgeActive : ''}`}>
          {counts.open}
        </span>
      </Button>

      <Button
        id="grn-stock-status-tab-closed"
        role="tab"
        aria-selected={statusFilter === 'CLOSED'}
        variant={statusFilter === 'CLOSED' ? 'secondary' : 'ghost'}
        size="sm"
        className={`${styles.statusTab} ${statusFilter === 'CLOSED' ? styles.statusTabActive : ''}`}
        onClick={() => onStatusChange('CLOSED')}
      >
        Closed{' '}
        <span className={`${styles.tabBadge} ${statusFilter === 'CLOSED' ? styles.tabBadgeActive : ''}`}>
          {counts.closed}
        </span>
      </Button>
    </div>
  );
}
