'use client';

import React from 'react';
import { Play, RefreshCw, ShieldAlert } from 'lucide-react';
import { can, type BackupStatus, type Role } from '@cold-storage/contracts';
import { Banner, Button, Card, FeedbackStates } from '@/components/ui';
import { ACCESS_MESSAGES, ERROR_TITLES, LOADING_LABELS } from '@/components/ui/stateCopy';
import { useAuth } from '@/context/AuthContext';
import { BackupLogTable } from './components/BackupLogTable';
import { BackupStatusCards } from './components/BackupStatusCards';
import { useBackupData } from './hooks/useBackupData';
import styles from './page.module.css';

export default function BackupPage() {
  const { user } = useAuth();
  const userRole = (user?.role ?? 'READ_ONLY') as Role;
  const canManage = can(userRole, 'backup:manage');

  const {
    backupStatus,
    loadingStatus,
    statusError,
    logsError,
    logs,
    totalLogs,
    page,
    setPage,
    statusFilter,
    setStatusFilter,
    loadingLogs,
    triggering,
    actionSuccess,
    actionError,
    totalPages,
    fetchStatus,
    fetchLogs,
    handleTriggerBackup,
  } = useBackupData(canManage);

  const backupsConfigured = backupStatus?.encryptedArchive.configured ?? false;
  const disabledReason = backupsConfigured
    ? undefined
    : 'Backups are unavailable until they are enabled in System Settings and the server has a BACKUP_ENCRYPTION_KEY.';

  if (!canManage) {
    return (
      <div className={styles.container}>
        <Card className={styles.restrictedRow}>
          <ShieldAlert size={20} color="var(--color-danger)" aria-hidden="true" />
          <div>
            <p className={styles.unauthorizedTitle}>Access Restricted</p>
            <p className={styles.subtitle}>{ACCESS_MESSAGES.backup}</p>
          </div>
      </Card>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <header className={styles.headerRow}>
        <div className={styles.titleArea}>
          <h1>Database Backups</h1>
        </div>
        <div className={styles.headerActions}>
          <Button
            variant="outline"
            onClick={() => {
              void fetchStatus();
              void fetchLogs();
            }}
            disabled={loadingStatus || loadingLogs}
            aria-label="Refresh backup data"
            leftIcon={<RefreshCw size={16} className={loadingStatus || loadingLogs ? styles.spinning : ''} />}
          >
            Refresh
          </Button>
          <Button
            id="trigger-backup-button"
            variant="primary"
            onClick={handleTriggerBackup}
            disabled={triggering || !backupsConfigured}
            isLoading={triggering}
            title={disabledReason}
            leftIcon={!triggering ? <Play size={16} /> : undefined}
          >
            {triggering ? LOADING_LABELS.encrypting : 'Trigger Manual Backup'}
          </Button>
        </div>
      </header>

      {actionSuccess && <Banner variant="success" message={actionSuccess} />}
      {actionError && <Banner message={actionError} id="backup-action-error" />}
      {statusError && (
        <FeedbackStates.Error
          title={ERROR_TITLES.default}
          message={statusError}
          onRetry={() => void fetchStatus()}
        />
      )}

      <BackupStatusCards backupStatus={backupStatus} />

      <BackupLogTable
        logs={logs}
        totalLogs={totalLogs}
        loading={loadingLogs}
        error={logsError}
        onRetry={() => void fetchLogs()}
        page={page}
        totalPages={totalPages}
        statusFilter={statusFilter}
        onStatusFilterChange={(st: '' | BackupStatus) => {
          setStatusFilter(st);
          setPage(1);
        }}
        onPageChange={setPage}
        onTriggerBackup={backupsConfigured ? handleTriggerBackup : undefined}
      />
    </div>
  );
}
