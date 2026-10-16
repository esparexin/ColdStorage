'use client';

import React from 'react';
import { AlertCircle, Check, CheckCircle2, Clock, GitMerge } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import type { GrnProfileTab } from '../hooks/grnTabPersistence.helper';
import styles from './GrnStatusTabs.module.css';

export interface GrnTabCounts {
  all?: number;
  active?: number;
  partial?: number;
  pendingPayment?: number;
  closed?: number;
  merged?: number;
}

interface GrnStatusTabsProps {
  currentTab: GrnProfileTab;
  onTabChange: (tab: GrnProfileTab) => void;
  counts?: GrnTabCounts;
}

export function GrnStatusTabs({ currentTab, onTabChange, counts }: GrnStatusTabsProps) {
  const renderBadge = (count?: number, isActive?: boolean) => {
    if (count === undefined) return null;
    return (
      <span className={`${styles.tabBadge} ${isActive ? styles.tabBadgeActive : ''}`}>
        {count}
      </span>
    );
  };

  return (
    <div className={styles.statusTabs} role="tablist" aria-label="Filter by GRN Profile">
      <Button
        id="grn-status-tab-all"
        role="tab"
        aria-selected={currentTab === ''}
        variant={currentTab === '' ? 'secondary' : 'ghost'}
        size="sm"
        className={`${styles.statusTab} ${currentTab === '' ? styles.statusTabActive : ''}`}
        onClick={() => onTabChange('')}
      >
        All {renderBadge(counts?.all, currentTab === '')}
      </Button>

      <Button
        id="grn-status-tab-active"
        role="tab"
        aria-selected={currentTab === 'ACTIVE'}
        variant={currentTab === 'ACTIVE' ? 'secondary' : 'ghost'}
        size="sm"
        className={`${styles.statusTab} ${currentTab === 'ACTIVE' ? styles.statusTabActive : ''}`}
        onClick={() => onTabChange('ACTIVE')}
        leftIcon={<CheckCircle2 size={12} aria-hidden="true" />}
      >
        Active {renderBadge(counts?.active, currentTab === 'ACTIVE')}
      </Button>

      <Button
        id="grn-status-tab-partial"
        role="tab"
        aria-selected={currentTab === 'PARTIAL'}
        variant={currentTab === 'PARTIAL' ? 'secondary' : 'ghost'}
        size="sm"
        className={`${styles.statusTab} ${currentTab === 'PARTIAL' ? styles.statusTabActive : ''}`}
        onClick={() => onTabChange('PARTIAL')}
        leftIcon={<Clock size={12} aria-hidden="true" />}
      >
        Partial {renderBadge(counts?.partial, currentTab === 'PARTIAL')}
      </Button>

      <Button
        id="grn-status-tab-pending-payment"
        role="tab"
        aria-selected={currentTab === 'PENDING_PAYMENT'}
        variant={currentTab === 'PENDING_PAYMENT' ? 'secondary' : 'ghost'}
        size="sm"
        className={`${styles.statusTab} ${currentTab === 'PENDING_PAYMENT' ? styles.statusTabActive : ''}`}
        onClick={() => onTabChange('PENDING_PAYMENT')}
        leftIcon={<AlertCircle size={12} aria-hidden="true" />}
      >
        Pending Payment {renderBadge(counts?.pendingPayment, currentTab === 'PENDING_PAYMENT')}
      </Button>

      <Button
        id="grn-status-tab-closed"
        role="tab"
        aria-selected={currentTab === 'CLOSED'}
        variant={currentTab === 'CLOSED' ? 'secondary' : 'ghost'}
        size="sm"
        className={`${styles.statusTab} ${currentTab === 'CLOSED' ? styles.statusTabActive : ''}`}
        onClick={() => onTabChange('CLOSED')}
        leftIcon={<Check size={12} aria-hidden="true" />}
      >
        Closed {renderBadge(counts?.closed, currentTab === 'CLOSED')}
      </Button>

      <Button
        id="grn-status-tab-merged"
        role="tab"
        aria-selected={currentTab === 'MERGED'}
        variant={currentTab === 'MERGED' ? 'secondary' : 'ghost'}
        size="sm"
        className={`${styles.statusTab} ${currentTab === 'MERGED' ? styles.statusTabActive : ''}`}
        onClick={() => onTabChange('MERGED')}
        leftIcon={<GitMerge size={12} aria-hidden="true" />}
      >
        Merged {renderBadge(counts?.merged, currentTab === 'MERGED')}
      </Button>
    </div>
  );
}
