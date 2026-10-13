'use client';

import React from 'react';
import { AlertCircle, CheckCircle2, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import type { DeliveryStatusTab } from '../hooks/deliveryFilter.helper';
import styles from './DeliveryStatusTabs.module.css';

interface DeliveryStatusTabsProps {
  currentTab: DeliveryStatusTab;
  onTabChange: (tab: DeliveryStatusTab) => void;
}

export function DeliveryStatusTabs({ currentTab, onTabChange }: DeliveryStatusTabsProps) {
  return (
    <div className={styles.statusTabs} role="tablist" aria-label="Filter by Challan Status">
      <Button
        id="delivery-status-tab-all"
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
        id="delivery-status-tab-active"
        role="tab"
        aria-selected={currentTab === 'ACTIVE'}
        variant={currentTab === 'ACTIVE' ? 'secondary' : 'ghost'}
        size="sm"
        className={`${styles.statusTab} ${currentTab === 'ACTIVE' ? styles.statusTabActive : ''}`}
        onClick={() => onTabChange('ACTIVE')}
        leftIcon={<CheckCircle2 size={12} aria-hidden="true" />}
      >
        Active
      </Button>
      <Button
        id="delivery-status-tab-closed"
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
        id="delivery-status-tab-due"
        role="tab"
        aria-selected={currentTab === 'DUE'}
        variant={currentTab === 'DUE' ? 'secondary' : 'ghost'}
        size="sm"
        className={`${styles.statusTab} ${currentTab === 'DUE' ? styles.statusTabActive : ''}`}
        onClick={() => onTabChange('DUE')}
        leftIcon={<AlertCircle size={12} aria-hidden="true" />}
      >
        Due Payment
      </Button>
    </div>
  );
}
