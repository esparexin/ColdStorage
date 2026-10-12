'use client';

import React from 'react';
import { AlertCircle, CheckCircle2, Clock } from 'lucide-react';
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
        Issued (Active)
      </Button>
      <Button
        id="delivery-status-tab-unsettled"
        role="tab"
        aria-selected={currentTab === 'UNSETTLED' || currentTab === 'CLOSED'}
        variant={currentTab === 'UNSETTLED' || currentTab === 'CLOSED' ? 'secondary' : 'ghost'}
        size="sm"
        className={`${styles.statusTab} ${currentTab === 'UNSETTLED' || currentTab === 'CLOSED' ? styles.statusTabActive : ''}`}
        onClick={() => onTabChange('UNSETTLED')}
        leftIcon={<AlertCircle size={12} aria-hidden="true" />}
      >
        Unsettled
      </Button>
      <Button
        id="delivery-status-tab-partial"
        role="tab"
        aria-selected={currentTab === 'PARTIAL'}
        variant={currentTab === 'PARTIAL' ? 'secondary' : 'ghost'}
        size="sm"
        className={`${styles.statusTab} ${currentTab === 'PARTIAL' ? styles.statusTabActive : ''}`}
        onClick={() => onTabChange('PARTIAL')}
        leftIcon={<Clock size={12} aria-hidden="true" />}
      >
        Partially Paid
      </Button>
    </div>
  );
}
