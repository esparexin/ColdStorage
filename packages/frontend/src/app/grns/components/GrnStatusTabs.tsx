'use client';

import React from 'react';
import { Clock, GitMerge, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import type { GrnStatusTab } from '../hooks/useGrns';
import styles from './GrnStatusTabs.module.css';

interface GrnStatusTabsProps {
  currentTab: GrnStatusTab;
  onTabChange: (tab: GrnStatusTab) => void;
}

export function GrnStatusTabs({ currentTab, onTabChange }: GrnStatusTabsProps) {
  return (
    <div className={styles.statusTabs} role="tablist" aria-label="Filter by GRN Status">
      <Button
        id="grn-status-tab-all"
        role="tab"
        aria-selected={currentTab === ''}
        variant={currentTab === '' ? 'secondary' : 'ghost'}
        size="sm"
        className={`${styles.statusTab} ${currentTab === '' ? styles.statusTabActive : ''}`}
        onClick={() => onTabChange('')}
      >
        All
      </Button>
      <Button
        id="grn-status-tab-open"
        role="tab"
        aria-selected={currentTab === 'OPEN'}
        variant={currentTab === 'OPEN' ? 'secondary' : 'ghost'}
        size="sm"
        className={`${styles.statusTab} ${currentTab === 'OPEN' ? styles.statusTabActive : ''}`}
        onClick={() => onTabChange('OPEN')}
        leftIcon={<Clock size={12} aria-hidden="true" />}
      >
        Open
      </Button>
      <Button
        id="grn-status-tab-closed"
        role="tab"
        aria-selected={currentTab === 'CLOSED'}
        variant={currentTab === 'CLOSED' ? 'secondary' : 'ghost'}
        size="sm"
        className={`${styles.statusTab} ${currentTab === 'CLOSED' ? styles.statusTabActive : ''}`}
        onClick={() => onTabChange('CLOSED')}
        leftIcon={<X size={12} aria-hidden="true" />}
      >
        Closed
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
        Merged
      </Button>
    </div>
  );
}
