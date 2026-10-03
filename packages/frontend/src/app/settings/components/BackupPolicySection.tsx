'use client';

import React from 'react';
import { Cloud } from 'lucide-react';
import styles from '../page.module.css';

interface BackupPolicySectionProps {
  atlasRetentionDays: number;
  setAtlasRetentionDays: (val: number) => void;
  driveRetentionDays: number;
  setDriveRetentionDays: (val: number) => void;
  driveBackupEnabled: boolean;
  setDriveBackupEnabled: (val: boolean) => void;
}

export function BackupPolicySection({
  atlasRetentionDays,
  setAtlasRetentionDays,
  driveRetentionDays,
  setDriveRetentionDays,
  driveBackupEnabled,
  setDriveBackupEnabled,
}: BackupPolicySectionProps) {
  return (
    <div className={styles.sectionCard}>
      <div className={styles.sectionHeader}>
        <Cloud size={18} color="var(--color-primary)" aria-hidden="true" />
        <h2 className={styles.sectionTitle}>Database Backup & Snapshot Policy</h2>
      </div>

      <div className={styles.formGrid2}>
        <div className={styles.fieldGroup}>
          <label htmlFor="atlas-retention" className={styles.fieldLabel}>
            Atlas Snapshot Retention (Days)
          </label>
          <input
            id="atlas-retention"
            type="number"
            min={1}
            max={365}
            required
            className={styles.fieldInput}
            value={atlasRetentionDays}
            onChange={(e) => setAtlasRetentionDays(parseInt(e.target.value, 10) || 7)}
          />
        </div>

        <div className={styles.fieldGroup}>
          <label htmlFor="drive-retention" className={styles.fieldLabel}>
            Google Drive Archive Retention (Days)
          </label>
          <input
            id="drive-retention"
            type="number"
            min={1}
            max={365}
            required
            className={styles.fieldInput}
            value={driveRetentionDays}
            onChange={(e) => setDriveRetentionDays(parseInt(e.target.value, 10) || 30)}
          />
        </div>
      </div>

      <label htmlFor="drive-backup-enabled" className={styles.checkboxLabel}>
        <input
          id="drive-backup-enabled"
          type="checkbox"
          checked={driveBackupEnabled}
          onChange={(e) => setDriveBackupEnabled(e.target.checked)}
        />
        <span>Enable Automated Daily Google Drive Backup Exports</span>
      </label>
    </div>
  );
}
