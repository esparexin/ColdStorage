'use client';

import React from 'react';
import { FileText, Plus } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import type { DeliveryViewTab } from '../hooks/deliveryTabPersistence.helper';
import styles from './DeliveryNavTabs.module.css';

interface DeliveryNavTabsProps {
  activeTab: DeliveryViewTab;
  canCreate: boolean;
  onTabChange: (tab: DeliveryViewTab) => void;
}

export function DeliveryNavTabs({ activeTab, canCreate, onTabChange }: DeliveryNavTabsProps) {
  return (
    <nav className={styles.navTabs} role="tablist" aria-label="Outward Deliveries Navigation">
      <Button
        id="delivery-view-tab-listing"
        role="tab"
        aria-selected={activeTab === 'listing'}
        variant={activeTab === 'listing' ? 'secondary' : 'ghost'}
        size="sm"
        className={`${styles.navTab} ${activeTab === 'listing' ? styles.navTabActive : ''}`}
        onClick={() => onTabChange('listing')}
        leftIcon={<FileText size={14} aria-hidden="true" />}
      >
        Delivery Challans
      </Button>

      {canCreate && (
        <Button
          id="delivery-view-tab-issue"
          role="tab"
          aria-selected={activeTab === 'issue'}
          variant={activeTab === 'issue' ? 'secondary' : 'ghost'}
          size="sm"
          className={`${styles.navTab} ${activeTab === 'issue' ? styles.navTabActive : ''}`}
          onClick={() => onTabChange('issue')}
          leftIcon={<Plus size={14} aria-hidden="true" />}
        >
          Issue Challan
        </Button>
      )}
    </nav>
  );
}
