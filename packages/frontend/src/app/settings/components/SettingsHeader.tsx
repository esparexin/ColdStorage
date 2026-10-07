'use client';

import React from 'react';
import { AlertCircle, CheckCircle2 } from 'lucide-react';
import { Banner } from '@/components/ui';
import styles from '../page.module.css';

interface SettingsHeaderProps {
  isConfigured: boolean;
}

export function SettingsHeader({ isConfigured }: SettingsHeaderProps) {
  return (
    <>
      <div className={styles.headerRow}>
        <div className={styles.titleArea}>
          <h1 className={styles.pageTitle}>System Settings</h1>
        </div>

        <div>
          {isConfigured ? (
            <span className={styles.badgeConfigured}>
              <CheckCircle2 size={13} aria-hidden="true" />
              Configured &amp; Active
            </span>
          ) : (
            <span
              className={styles.badgeConfigured}
              style={{ background: 'var(--color-warning-subtle)', color: 'var(--color-warning)' }}
            >
              <AlertCircle size={13} aria-hidden="true" />
              Configuration Pending
            </span>
          )}
        </div>
      </div>

      {!isConfigured && (
        <Banner
          variant="info"
          id="settings-unconfigured"
          message="Organization Details Required: Official document generation (Goods Receipt Notes, Delivery Challans, and Rent Receipts) remains locked until organization name, registered address, and contact details are saved."
        />
      )}
    </>
  );
}
