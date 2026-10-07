'use client';

import React from 'react';
import { Pencil } from 'lucide-react';
import { Banner, Button } from '@/components/ui';
import { LOADING_LABELS } from '@/components/ui/stateCopy';
import { BackupPolicySection } from './BackupPolicySection';
import { BackupPolicyView } from './BackupPolicyView';
import styles from '../page.module.css';

interface BackupTabProps {
  retentionDays: number;
  setRetentionDays: (val: number) => void;
  backupEnabled: boolean;
  setBackupEnabled: (val: boolean) => void;
  isEditing: boolean;
  isDirty: boolean;
  saving: boolean;
  saveSuccess: string | null;
  saveError: string | null;
  onEdit: () => void;
  onCancel: () => void;
  onSave: () => void;
}

export function BackupTab(props: BackupTabProps) {
  const { isEditing, isDirty, saving, saveSuccess, saveError, onEdit, onCancel, onSave } = props;
  return (
    <section
      id="settings-panel-backup"
      role="tabpanel"
      aria-labelledby="settings-tab-backup"
      className={styles.tabPanel}
    >
      <div className={styles.panelHeader}>
        <div>
          <h2 className={styles.panelTitle}>Backup Policy</h2>
          <p className={styles.panelDescription}>
            Retention and availability for operator-triggered encrypted archives.
          </p>
        </div>
        {!isEditing && (
          <div className={styles.panelActions}>
            <Button
              id="edit-backup-btn"
              variant="outline"
              size="sm"
              onClick={onEdit}
              leftIcon={<Pencil size={14} aria-hidden="true" />}
            >
              Edit
            </Button>
          </div>
        )}
      </div>

      {saveSuccess && <Banner variant="success" message={saveSuccess} />}
      {saveError && <Banner message={saveError} id="backup-save-error" />}

      {!isEditing ? (
        <BackupPolicyView retentionDays={props.retentionDays} backupEnabled={props.backupEnabled} />
      ) : (
        <>
          <BackupPolicySection
            retentionDays={props.retentionDays}
            setRetentionDays={props.setRetentionDays}
            backupEnabled={props.backupEnabled}
            setBackupEnabled={props.setBackupEnabled}
          />
          <div className={styles.editActions}>
            {isDirty && <span className={styles.unsavedHint}>Unsaved changes</span>}
            <Button id="cancel-backup-btn" variant="ghost" size="sm" onClick={onCancel}>
              Cancel
            </Button>
            <Button
              id="save-backup-btn"
              variant="primary"
              size="sm"
              onClick={onSave}
              disabled={saving}
              isLoading={saving}
            >
              {saving ? LOADING_LABELS.saving : 'Save Backup Policy'}
            </Button>
          </div>
        </>
      )}
    </section>
  );
}
