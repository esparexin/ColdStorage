'use client';

import React from 'react';
import { Cloud, Lock, Shield } from 'lucide-react';
import type { BackupStatusResponse } from '@cold-storage/contracts';
import { Badge, Card } from '@/components/ui';
import { formatDate } from '../utils';
import styles from '../page.module.css';

interface BackupStatusCardsProps {
  backupStatus: BackupStatusResponse | null;
}

export function BackupStatusCards({ backupStatus }: BackupStatusCardsProps) {
  const atlas = backupStatus?.atlasManagedBackup;
  const appBackup = backupStatus?.applicationEncryptedBackup;

  return (
    <section className={styles.cardsGrid} aria-label="Backup Status Projections">
      <Card
        title={
          <span className={styles.cardHeaderLeft}>
            <Cloud size={20} color="var(--color-primary)" aria-hidden="true" />
            Platform Continuous Backup
          </span>
        }
        headerAction={<Badge variant="success">{atlas?.status || 'CONFIGURED'}</Badge>}
      >
        <dl className={styles.metricsList}>
          <div className={styles.metricRow}>
            <dt className={styles.metricLabel}>Provider</dt>
            <dd className={styles.metricValue}>{atlas?.provider || 'MongoDB Atlas'}</dd>
          </div>
          <div className={styles.metricRow}>
            <dt className={styles.metricLabel}>Operational Mode</dt>
            <dd className={styles.metricValue}>{atlas?.mode || 'PLATFORM_MANAGED'}</dd>
          </div>
          <div className={styles.metricRow}>
            <dt className={styles.metricLabel}>Retention Window</dt>
            <dd className={styles.metricValue}>{atlas?.retentionDays ?? '—'} Days</dd>
          </div>
        </dl>
      </Card>

      <Card
        title={
          <span className={styles.cardHeaderLeft}>
            <Shield size={20} color="var(--color-primary)" aria-hidden="true" />
            Application Encrypted Backups
          </span>
        }
        headerAction={
          <Badge variant={appBackup?.enabled ? 'success' : 'danger'}>
            {appBackup?.enabled ? 'ACTIVE' : 'DISABLED'}
          </Badge>
        }
      >
        <dl className={styles.metricsList}>
          <div className={styles.metricRow}>
            <dt className={styles.metricLabel}>Encryption Standard</dt>
            <dd className={styles.metricValue}>
              <Lock size={12} aria-hidden="true" /> AES-256-GCM + SHA-256
            </dd>
          </div>
          <div className={styles.metricRow}>
            <dt className={styles.metricLabel}>Configured Retention</dt>
            <dd className={styles.metricValue}>{appBackup?.retentionDays ?? '—'} Days</dd>
          </div>
          <div className={styles.metricRow}>
            <dt className={styles.metricLabel}>Last Completed Run</dt>
            <dd className={styles.metricValue}>{formatDate(appBackup?.lastBackupAt)}</dd>
          </div>
          <div className={styles.metricRow}>
            <dt className={styles.metricLabel}>Lifetime Completed Backups</dt>
            <dd className={styles.metricValue}>{appBackup?.totalCompletedBackups ?? 0}</dd>
          </div>
        </dl>
      </Card>
    </section>
  );
}