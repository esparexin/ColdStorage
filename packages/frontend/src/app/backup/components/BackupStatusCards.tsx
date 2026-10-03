'use client';

import React from 'react';
import { ShieldCheck } from 'lucide-react';
import type { BackupStatusResponse } from '@cold-storage/contracts';
import { Badge, StatCard, StatGrid } from '@/components/ui';
import { formatDate } from '../utils';
import styles from './BackupStatusCards.module.css';

interface BackupStatusCardsProps {
  backupStatus: BackupStatusResponse | null;
}

/**
 * Reports the encrypted-archive backup subsystem exactly as the backend implements it.
 * Every tile is derived from an observed field; nothing is asserted about providers,
 * scheduling or platforms that this codebase does not integrate with.
 */
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

      <StatGrid label="Backup configuration and history">
        <StatCard
          label="Encryption"
          value="AES-256-GCM"
          sub="SHA-256 checksum recorded per archive"
          icon={ShieldCheck}
          iconSize={18}
        />
        <StatCard
          label="Retention recorded"
          value={archive?.retentionDays ?? '—'}
          sub="Days, stored as the archive expiry date"
          iconSize={18}
        />
        <StatCard
          label="Last completed run"
          value={formatDate(archive?.lastBackupAt)}
          iconSize={18}
        />
        <StatCard
          label="Completed backups"
          value={archive?.totalCompletedBackups ?? 0}
          iconSize={18}
        />
      </StatGrid>

      <p className={styles.limitations}>
        Archives are written to the backend's local storage directory. Backups are started
        manually, expired archives are not deleted automatically, and restoring an archive is
        not currently available in the application.
      </p>
    </div>
  );
}