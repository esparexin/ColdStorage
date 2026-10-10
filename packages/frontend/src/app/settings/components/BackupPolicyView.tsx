'use client';

import React from 'react';
import styles from './SettingsView.module.css';

interface BackupPolicyViewProps {
  retentionDays: number;
  backupEnabled: boolean;
}

export function BackupPolicyView({ retentionDays, backupEnabled }: BackupPolicyViewProps) {
  return (
    <>
      <dl className={styles.viewList}>
        <div className={styles.row}>
          <dt>Archive retention</dt>
          <dd>
            {retentionDays} days
          </dd>
        </div>
        <div className={styles.row}>
          <dt>Encrypted backups</dt>
          <dd>{backupEnabled ? 'Enabled' : 'Disabled'}</dd>
        </div>
      </dl>
      <p className={styles.note}>
        Backups are started manually from the Backup page and require a BACKUP_ENCRYPTION_KEY on
        the server. When they are disabled or the key is missing, backup actions stay unavailable.
        Expired archives are not deleted automatically.
      </p>
    </>
  );
}
