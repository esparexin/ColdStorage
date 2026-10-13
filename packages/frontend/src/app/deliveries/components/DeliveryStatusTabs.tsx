'use client';

import React from 'react';
import { AlertCircle, CheckCircle2, Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import type { DeliveryStatusTab } from '../hooks/deliveryFilter.helper';
import type { DeliveryViewTab } from '../hooks/deliveryTabPersistence.helper';
import styles from './DeliveryStatusTabs.module.css';

interface DeliveryStatusTabsProps {
  activeView: DeliveryViewTab;
  currentTab: DeliveryStatusTab;
  onSelectTab: (tab: '' | 'ACTIVE' | 'DUE' | 'CLOSED' | 'ISSUE') => void;
  canCreate?: boolean;
}

export function DeliveryStatusTabs({
  activeView,
  currentTab,
  onSelectTab,
  canCreate = true,
}: DeliveryStatusTabsProps) {
  const isIssueActive = activeView === 'issue';

  return (
    <div className={styles.statusTabs} role="tablist" aria-label="Filter by Challan Status">
      <Button
        id="delivery-status-tab-all"
        role="tab"
        aria-selected={!isIssueActive && currentTab === ''}
        variant={!isIssueActive && currentTab === '' ? 'secondary' : 'ghost'}
        size="sm"
        className={`${styles.statusTab} ${!isIssueActive && currentTab === '' ? styles.statusTabActive : ''}`}
        onClick={() => onSelectTab('')}
      >
        All
      </Button>
      <Button
        id="delivery-status-tab-active"
        role="tab"
        aria-selected={!isIssueActive && currentTab === 'ACTIVE'}
        variant={!isIssueActive && currentTab === 'ACTIVE' ? 'secondary' : 'ghost'}
        size="sm"
        className={`${styles.statusTab} ${!isIssueActive && currentTab === 'ACTIVE' ? styles.statusTabActive : ''}`}
        onClick={() => onSelectTab('ACTIVE')}
        leftIcon={<CheckCircle2 size={12} aria-hidden="true" />}
      >
        Active
      </Button>
      <Button
        id="delivery-status-tab-due"
        role="tab"
        aria-selected={!isIssueActive && currentTab === 'DUE'}
        variant={!isIssueActive && currentTab === 'DUE' ? 'secondary' : 'ghost'}
        size="sm"
        className={`${styles.statusTab} ${!isIssueActive && currentTab === 'DUE' ? styles.statusTabActive : ''}`}
        onClick={() => onSelectTab('DUE')}
        leftIcon={<AlertCircle size={12} aria-hidden="true" />}
      >
        Due Payment
      </Button>
      <Button
        id="delivery-status-tab-closed"
        role="tab"
        aria-selected={!isIssueActive && currentTab === 'CLOSED'}
        variant={!isIssueActive && currentTab === 'CLOSED' ? 'secondary' : 'ghost'}
        size="sm"
        className={`${styles.statusTab} ${!isIssueActive && currentTab === 'CLOSED' ? styles.statusTabActive : ''}`}
        onClick={() => onSelectTab('CLOSED')}
        leftIcon={<X size={12} aria-hidden="true" />}
      >
        Closed
      </Button>
      {canCreate && (
        <Button
          id="create-delivery-header-btn"
          role="tab"
          aria-selected={isIssueActive}
          variant={isIssueActive ? 'secondary' : 'ghost'}
          size="sm"
          className={`${styles.statusTab} ${isIssueActive ? styles.statusTabActive : ''}`}
          onClick={() => onSelectTab('ISSUE')}
          leftIcon={<Plus size={12} aria-hidden="true" />}
        >
          Outward
        </Button>
      )}
    </div>
  );
}
