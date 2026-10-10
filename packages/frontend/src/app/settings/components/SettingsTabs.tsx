'use client';

import React from 'react';
import { Button } from '@/components/ui';
import styles from '../page.module.css';

export type SettingsTabId =
  | 'organization'
  | 'logo'
  | 'backup'
  | 'pricing'
  | 'facilities'
  | 'connectivity';

export const TABS: Array<{ id: SettingsTabId; label: string }> = [
  { id: 'organization', label: 'Organization' },
  { id: 'logo', label: 'Brand Logo' },
  { id: 'backup', label: 'Backup Policy' },
  { id: 'pricing', label: 'Bag Pricing & Rent' },
  { id: 'facilities', label: 'Facilities' },
  { id: 'connectivity', label: 'Connectivity' },
];

export function isTabId(value: string | null): value is SettingsTabId {
  return TABS.some((t) => t.id === value);
}

interface SettingsTabsProps {
  activeTab: SettingsTabId;
  onRequestTab: (tab: SettingsTabId) => void;
}

export function SettingsTabs({ activeTab, onRequestTab }: SettingsTabsProps) {
  return (
    <nav className={styles.tabs} role="tablist" aria-label="System Settings sections">
      {TABS.map((tab) => {
        const selected = tab.id === activeTab;
        return (
          <Button
            key={tab.id}
            id={`settings-tab-${tab.id}`}
            role="tab"
            aria-selected={selected}
            aria-controls={`settings-panel-${tab.id}`}
            tabIndex={selected ? 0 : -1}
            variant={selected ? 'secondary' : 'ghost'}
            size="sm"
            className={`${styles.tab} ${selected ? styles.tabActive : ''}`}
            onClick={() => onRequestTab(tab.id)}
          >
            {tab.label}
          </Button>
        );
      })}
    </nav>
  );
}
