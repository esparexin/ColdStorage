'use client';

import React from 'react';
import { AlertCircle, CheckCircle2, Play, RefreshCw, ShieldAlert } from 'lucide-react';
import { can, type BackupStatus, type Role } from '@cold-storage/contracts';
import { Button, Card } from '@/components/ui';
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
            <p className={styles.unauthorizedTitle}>Restricted Access</p>
            <p className={styles.subtitle}>
              Backup management requires the &lsquo;backup:manage&rsquo; permission.
            </p>
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
            {triggering ? 'Encrypting...' : 'Trigger Manual Backup'}
          </Button>
        </div>
      </header>

      {actionSuccess && (
        <div className={`${styles.banner} ${styles.bannerSuccess}`} role="status">
          <CheckCircle2 size={18} />
          <span>{actionSuccess}</span>
        </div>
      )}
      {actionError && (
        <div className={`${styles.banner} ${styles.bannerError}`} role="alert">
          <AlertCircle size={18} />
          <span>{actionError}</span>
        </div>
      )}

      <BackupStatusCards backupStatus={backupStatus} />

      <BackupLogTable
        logs={logs}
        totalLogs={totalLogs}
        loading={loadingLogs}
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
