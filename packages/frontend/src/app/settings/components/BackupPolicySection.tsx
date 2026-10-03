'use client';

import React from 'react';
import { Input } from '@/components/ui';
import styles from './BackupPolicySection.module.css';

interface BackupPolicySectionProps {
  retentionDays: number;
  setRetentionDays: (val: number) => void;
  backupEnabled: boolean;
  setBackupEnabled: (val: boolean) => void;
}

/**
 * Backup policy.
 *
 * The copy describes only what the backend actually performs: an operator-triggered, AES-256-GCM
 * encrypted archive written to the backend's local storage directory. There is no scheduler and
 * no cloud integration, so no automation or provider is claimed here.
 */
export function BackupPolicySection({
  retentionDays,
  setRetentionDays,
  backupEnabled,
  setBackupEnabled,
}: BackupPolicySectionProps) {
  return (
    <section className={styles.section} aria-labelledby="backup-policy-heading">
      <h2 id="backup-policy-heading" className={styles.title}>
        Database Backup
      </h2>

      <div className={styles.row}>
        <div className={styles.field}>
          <Input
            id="retention-days"
            label="Archive retention (days)"
            type="number"
            min={1}
            max={365}
            required
            value={retentionDays}
            onChange={(e) => setRetentionDays(parseInt(e.target.value, 10) || 30)}
            className={styles.narrowInput}
          />
          <p className={styles.hint}>
            Recorded as the expiry date on each archive. Expired archives are not deleted
            automatically.
          </p>
        </div>

        <label htmlFor="backup-enabled" className={styles.checkboxLabel}>
          <input
            id="backup-enabled"
            type="checkbox"
            checked={backupEnabled}
            onChange={(e) => setBackupEnabled(e.target.checked)}
          />
          <span>Enable encrypted database backups</span>
        </label>
      </div>

      <p className={styles.note}>
        Backups are started manually from the Backup page and require a BACKUP_ENCRYPTION_KEY on
        the server. When they are disabled or the key is missing, backup actions stay unavailable.
      </p>
    </section>
  );
}