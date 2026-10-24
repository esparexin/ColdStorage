'use client';

import React from 'react';
import { Button } from '@/components/ui';
import type { RentStatusFilter } from '../hooks/rentFilter.helper';
import styles from './RentStatusTabs.module.css';

export interface RentTabCounts {
  all: number;
  unpaid: number;
  partiallyPaid: number;
  settled: number;
  noDues?: number;
  merged?: number;
}

interface RentStatusTabsProps {
  statusFilter: RentStatusFilter;
  onStatusChange: (status: RentStatusFilter) => void;
  counts: RentTabCounts;
}

export function RentStatusTabs({
  statusFilter,
  onStatusChange,
  counts,
}: RentStatusTabsProps) {
  return (
    <div className={styles.statusTabs} role="tablist" aria-label="Filter by Payment Status">
      <Button
        id="rent-status-tab-all"
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
        id="rent-status-tab-unpaid"
        role="tab"
        aria-selected={statusFilter === 'UNPAID'}
        variant={statusFilter === 'UNPAID' ? 'secondary' : 'ghost'}
        size="sm"
        className={`${styles.statusTab} ${statusFilter === 'UNPAID' ? styles.statusTabActive : ''}`}
        onClick={() => onStatusChange('UNPAID')}
      >
        Unpaid{' '}
        <span className={`${styles.tabBadge} ${statusFilter === 'UNPAID' ? styles.tabBadgeActive : ''}`}>
          {counts.unpaid}
        </span>
      </Button>

      <Button
        id="rent-status-tab-partially-paid"
        role="tab"
        aria-selected={statusFilter === 'PARTIALLY_PAID'}
        variant={statusFilter === 'PARTIALLY_PAID' ? 'secondary' : 'ghost'}
        size="sm"
        className={`${styles.statusTab} ${statusFilter === 'PARTIALLY_PAID' ? styles.statusTabActive : ''}`}
        onClick={() => onStatusChange('PARTIALLY_PAID')}
      >
        Partially Paid{' '}
        <span className={`${styles.tabBadge} ${statusFilter === 'PARTIALLY_PAID' ? styles.tabBadgeActive : ''}`}>
          {counts.partiallyPaid}
        </span>
      </Button>

      <Button
        id="rent-status-tab-settled"
        role="tab"
        aria-selected={statusFilter === 'SETTLED'}
        variant={statusFilter === 'SETTLED' ? 'secondary' : 'ghost'}
        size="sm"
        className={`${styles.statusTab} ${statusFilter === 'SETTLED' ? styles.statusTabActive : ''}`}
        onClick={() => onStatusChange('SETTLED')}
      >
        Settled{' '}
        <span className={`${styles.tabBadge} ${statusFilter === 'SETTLED' ? styles.tabBadgeActive : ''}`}>
          {counts.settled}
        </span>
      </Button>

      <Button
        id="rent-status-tab-no-dues"
        role="tab"
        aria-selected={statusFilter === 'NO_DUES'}
        variant={statusFilter === 'NO_DUES' ? 'secondary' : 'ghost'}
        size="sm"
        className={`${styles.statusTab} ${statusFilter === 'NO_DUES' ? styles.statusTabActive : ''}`}
        onClick={() => onStatusChange('NO_DUES')}
      >
        No Dues{' '}
        <span className={`${styles.tabBadge} ${statusFilter === 'NO_DUES' ? styles.tabBadgeActive : ''}`}>
          {counts.noDues ?? 0}
        </span>
      </Button>

      <Button
        id="rent-status-tab-merged"
        role="tab"
        aria-selected={statusFilter === 'MERGED'}
        variant={statusFilter === 'MERGED' ? 'secondary' : 'ghost'}
        size="sm"
        className={`${styles.statusTab} ${statusFilter === 'MERGED' ? styles.statusTabActive : ''}`}
        onClick={() => onStatusChange('MERGED')}
      >
        Merged{' '}
        <span className={`${styles.tabBadge} ${statusFilter === 'MERGED' ? styles.tabBadgeActive : ''}`}>
          {counts.merged ?? 0}
        </span>
      </Button>
    </div>
  );
}
