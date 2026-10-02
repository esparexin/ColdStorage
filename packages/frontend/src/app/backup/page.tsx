'use client';

import React from 'react';
import { AlertCircle, CheckCircle2, Play, RefreshCw, ShieldAlert } from 'lucide-react';
import { can, type BackupStatus, type Role } from '@cold-storage/contracts';
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

  if (!canManage) {
    return (
      <div className={styles.container}>
        <div className={styles.unauthorizedWrapper}>
          <ShieldAlert size={48} color="var(--color-danger)" />
          <h2>Restricted Access</h2>
          <p className={styles.subtitle}>
            Backup management and triggering encrypted backups requires SUPER_ADMIN authority.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div className={styles.titleArea}>
          <h1>Database Backups & Continuity</h1>
          <p className={styles.subtitle}>
            Authoritative platform status, AES-256 encrypted on-demand backups, and immutable
            operation logs.
          </p>
        </div>
        <div className={styles.headerActions}>
          <button
            type="button"
            className={styles.refreshBtn}
            onClick={() => {
              void fetchStatus();
              void fetchLogs();
            }}
            disabled={loadingStatus || loadingLogs}
            aria-label="Refresh backup data"
          >
            <RefreshCw size={16} className={loadingStatus || loadingLogs ? styles.spinning : ''} />
            <span>Refresh</span>
          </button>
          <button
            type="button"
            id="trigger-backup-button"
            className={styles.triggerBtn}
            onClick={handleTriggerBackup}
            disabled={triggering}
          >
            {triggering ? (
              <>
                <RefreshCw size={16} className={styles.spinning} />
                <span>Encrypting & Writing Backup...</span>
              </>
            ) : (
              <>
                <Play size={16} />
                <span>Trigger Manual Backup</span>
              </>
            )}
          </button>
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
        onTriggerBackup={handleTriggerBackup}
      />
    </div>
  );
}
