'use client';

import React from 'react';
import type { BackupStatusResponse } from '@cold-storage/contracts';
import { Badge, StatCard, StatGrid } from '@/components/ui';
import { formatDate } from '../utils';
import styles from './BackupStatusCards.module.css';

interface BackupStatusCardsProps {
  backupStatus: BackupStatusResponse | null;
}

export function BackupStatusCards({ backupStatus }: BackupStatusCardsProps) {
  const archive = backupStatus?.encryptedArchive;
  const configured = archive?.configured ?? false;

  return (
    <div className={styles.wrapper}>
      <div className={styles.header}>
        <h2 className={styles.title}>Encrypted Database Backups</h2>
        <Badge variant={configured ? 'success' : 'danger'}>
          {configured ? 'CONFIGURED' : 'NOT CONFIGURED'}
        </Badge>
      </div>

      {!configured && (
        <p className={styles.notice} role="status">
          Backups are unavailable. {archive?.enabled === false
            ? 'Encrypted backups are switched off in System Settings.'
            : 'BACKUP_ENCRYPTION_KEY is not set on the server.'}{' '}
          Backup actions stay disabled until this is resolved.
        </p>
      )}

      <StatGrid label="Backup status">
        <StatCard
          label="Retention"
          value={archive?.retentionDays ?? '—'}
          accent="primary"
        />
        <StatCard label="Last Completed Run" value={formatDate(archive?.lastBackupAt)} />
      </StatGrid>
    </div>
  );
}