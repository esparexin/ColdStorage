'use client';

import React from 'react';
import { Cloud, Lock, Shield } from 'lucide-react';
import type { BackupStatusResponse } from '@cold-storage/contracts';
import { formatDate } from '../utils';
import styles from '../page.module.css';

interface BackupStatusCardsProps {
  backupStatus: BackupStatusResponse | null;
}

export function BackupStatusCards({ backupStatus }: BackupStatusCardsProps) {
  return (
    <section className={styles.cardsGrid} aria-label="Backup Status Projections">
      <div className={styles.statusCard}>
        <div className={styles.cardHeader}>
          <div className={styles.cardHeaderLeft}>
            <Cloud size={20} color="var(--color-primary)" />
            <h2>Platform Continuous Backup</h2>
          </div>
          <span className={`${styles.badge} ${styles.badgeSuccess}`}>
            {backupStatus?.atlasManagedBackup.status || 'CONFIGURED'}
          </span>
        </div>
        <div className={styles.metricsList}>
          <div className={styles.metricRow}>
            <span className={styles.metricLabel}>Provider</span>
            <span className={styles.metricValue}>
              {backupStatus?.atlasManagedBackup.provider || 'MongoDB Atlas'}
            </span>
          </div>
          <div className={styles.metricRow}>
            <span className={styles.metricLabel}>Operational Mode</span>
            <span className={styles.metricValue}>
              {backupStatus?.atlasManagedBackup.mode || 'PLATFORM_MANAGED'}
            </span>
          </div>
          <div className={styles.metricRow}>
            <span className={styles.metricLabel}>Retention Window</span>
            <span className={styles.metricValue}>
              {backupStatus?.atlasManagedBackup.retentionDays ?? '—'} Days
            </span>
          </div>
        </div>
      </div>

      <div className={styles.statusCard}>
        <div className={styles.cardHeader}>
          <div className={styles.cardHeaderLeft}>
            <Shield size={20} color="var(--color-primary)" />
            <h2>Application Encrypted Backups</h2>
          </div>
          <span
            className={`${styles.badge} ${
              backupStatus?.applicationEncryptedBackup.enabled
                ? styles.badgeSuccess
                : styles.badgeDanger
            }`}
          >
            {backupStatus?.applicationEncryptedBackup.enabled ? 'ACTIVE' : 'DISABLED'}
          </span>
        </div>
        <div className={styles.metricsList}>
          <div className={styles.metricRow}>
            <span className={styles.metricLabel}>Encryption Standard</span>
            <span className={styles.metricValue}>
              <Lock size={12} style={{ display: 'inline', marginRight: 4 }} />
              AES-256-GCM + SHA-256
            </span>
          </div>
          <div className={styles.metricRow}>
            <span className={styles.metricLabel}>Configured Retention</span>
            <span className={styles.metricValue}>
              {backupStatus?.applicationEncryptedBackup.retentionDays ?? '—'} Days
            </span>
          </div>
          <div className={styles.metricRow}>
            <span className={styles.metricLabel}>Last Completed Run</span>
            <span className={styles.metricValue}>
              {formatDate(backupStatus?.applicationEncryptedBackup.lastBackupAt)}
            </span>
          </div>
          <div className={styles.metricRow}>
            <span className={styles.metricLabel}>Lifetime Completed Backups</span>
            <span className={styles.metricValue}>
              {backupStatus?.applicationEncryptedBackup.totalCompletedBackups ?? 0}
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}
