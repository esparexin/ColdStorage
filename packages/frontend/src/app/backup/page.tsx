'use client';

import React, { useCallback, useEffect, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Cloud,
  Lock,
  Play,
  RefreshCw,
  Shield,
  ShieldAlert,
} from 'lucide-react';
import {
  can,
  type BackupLogRecord,
  type BackupStatus,
  type BackupStatusResponse,
  type Role,
} from '@cold-storage/contracts';
import { FeedbackStates } from '@/components/ui/FeedbackStates';
import { useAuth } from '@/context/AuthContext';
import { requestWithAuth } from '@/lib/api-client';
import styles from './page.module.css';

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

function formatDate(date: string | Date | null | undefined): string {
  if (!date) return '—';
  const d = new Date(date);
  return d.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  });
}

export default function BackupPage() {
  const { user } = useAuth();
  const userRole = (user?.role ?? 'READ_ONLY') as Role;
  const canManage = can(userRole, 'backup:manage');

  // Status metrics
  const [backupStatus, setBackupStatus] = useState<BackupStatusResponse | null>(null);
  const [loadingStatus, setLoadingStatus] = useState(true);

  // Backup log records
  const [logs, setLogs] = useState<BackupLogRecord[]>([]);
  const [totalLogs, setTotalLogs] = useState(0);
  const [page, setPage] = useState(1);
  const limit = 15;
  const [statusFilter, setStatusFilter] = useState<'' | BackupStatus>('');
  const [loadingLogs, setLoadingLogs] = useState(true);

  // Trigger state
  const [triggering, setTriggering] = useState(false);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const fetchStatus = useCallback(async () => {
    if (!canManage) return;
    setLoadingStatus(true);
    try {
      const res = await requestWithAuth('/api/backups/status');
      if (res.ok) {
        const data = (await res.json()) as BackupStatusResponse;
        setBackupStatus(data);
      }
    } catch {
      // Handled silently
    } finally {
      setLoadingStatus(false);
    }
  }, [canManage]);

  const fetchLogs = useCallback(async () => {
    if (!canManage) return;
    setLoadingLogs(true);
    try {
      const params = new URLSearchParams();
      params.set('page', String(page));
      params.set('limit', String(limit));
      if (statusFilter) {
        params.set('status', statusFilter);
      }
      const res = await requestWithAuth(`/api/backups?${params.toString()}`);
      if (res.ok) {
        const data = (await res.json()) as {
          items: BackupLogRecord[];
          total: number;
          page: number;
          limit: number;
        };
        setLogs(data.items || []);
        setTotalLogs(data.total || 0);
      }
    } catch {
      // Handled silently
    } finally {
      setLoadingLogs(false);
    }
  }, [canManage, page, limit, statusFilter]);

  useEffect(() => {
    if (canManage) {
      void fetchStatus();
      void fetchLogs();
    }
  }, [canManage, fetchStatus, fetchLogs]);

  const handleTriggerBackup = async () => {
    if (triggering) return;
    setTriggering(true);
    setActionSuccess(null);
    setActionError(null);

    try {
      const res = await requestWithAuth('/api/backups/trigger', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ backupType: 'MANUAL' }),
      });

      if (!res.ok) {
        const err = (await res.json()) as { error?: string };
        throw new Error(err.error || `Backup trigger failed (HTTP ${res.status})`);
      }

      const data = (await res.json()) as { message?: string; filename?: string };
      setActionSuccess(data.message || `Encrypted backup completed: ${data.filename || ''}`);
      void fetchStatus();
      void fetchLogs();
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : 'Backup execution failed');
    } finally {
      setTriggering(false);
    }
  };

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

  const totalPages = Math.ceil(totalLogs / limit);

  return (
    <div className={styles.container}>
      {/* Header */}
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

      {/* Notifications */}
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

      {/* Authoritative Status Cards */}
      <section className={styles.cardsGrid} aria-label="Backup Status Projections">
        {/* Atlas Managed Continuous Backup */}
        <div className={styles.statusCard}>
          <div className={styles.cardHeader}>
            <div className={styles.cardHeaderLeft}>
              <Cloud size={20} color="var(--color-primary)" />
              <h2>Platform Continuous Backup</h2>
            </div>
            <span className={`${styles.badge} ${styles.badgeSuccess}`}>
              {backupStatus?.atlasManagedBackup.status || 'CONFIGURED'}
            </span>
          </div>
          <div className={styles.metricsList}>
            <div className={styles.metricRow}>
              <span className={styles.metricLabel}>Provider</span>
              <span className={styles.metricValue}>
                {backupStatus?.atlasManagedBackup.provider || 'MongoDB Atlas'}
              </span>
            </div>
            <div className={styles.metricRow}>
              <span className={styles.metricLabel}>Operational Mode</span>
              <span className={styles.metricValue}>
                {backupStatus?.atlasManagedBackup.mode || 'PLATFORM_MANAGED'}
              </span>
            </div>
            <div className={styles.metricRow}>
              <span className={styles.metricLabel}>Retention Window</span>
              <span className={styles.metricValue}>
                {backupStatus?.atlasManagedBackup.retentionDays ?? '—'} Days
              </span>
            </div>
          </div>
        </div>

        {/* Application Encrypted Backup */}
        <div className={styles.statusCard}>
          <div className={styles.cardHeader}>
            <div className={styles.cardHeaderLeft}>
              <Shield size={20} color="var(--color-primary)" />
              <h2>Application Encrypted Backups</h2>
            </div>
            <span
              className={`${styles.badge} ${
                backupStatus?.applicationEncryptedBackup.enabled
                  ? styles.badgeSuccess
                  : styles.badgeDanger
              }`}
            >
              {backupStatus?.applicationEncryptedBackup.enabled ? 'ACTIVE' : 'DISABLED'}
            </span>
          </div>
          <div className={styles.metricsList}>
            <div className={styles.metricRow}>
              <span className={styles.metricLabel}>Encryption Standard</span>
              <span className={styles.metricValue}>
                <Lock size={12} style={{ display: 'inline', marginRight: 4 }} />
                AES-256-GCM + SHA-256
              </span>
            </div>
            <div className={styles.metricRow}>
              <span className={styles.metricLabel}>Configured Retention</span>
              <span className={styles.metricValue}>
                {backupStatus?.applicationEncryptedBackup.retentionDays ?? '—'} Days
              </span>
            </div>
            <div className={styles.metricRow}>
              <span className={styles.metricLabel}>Last Completed Run</span>
              <span className={styles.metricValue}>
                {formatDate(backupStatus?.applicationEncryptedBackup.lastBackupAt)}
              </span>
            </div>
            <div className={styles.metricRow}>
              <span className={styles.metricLabel}>Lifetime Completed Backups</span>
              <span className={styles.metricValue}>
                {backupStatus?.applicationEncryptedBackup.totalCompletedBackups ?? 0}
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* Backup Log History */}
      <section className={styles.tableSection}>
        <div className={styles.tableHeader}>
          <div className={styles.tableTitleArea}>
            <h2>Encrypted Backup Log Ledger</h2>
            <span className={styles.tableCount}>({totalLogs} total entries)</span>
          </div>
          <div className={styles.filterControls}>
            <label htmlFor="status-filter" className={styles.metricLabel}>
              Status:
            </label>
            <select
              id="status-filter"
              className={styles.selectInput}
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value as '' | BackupStatus);
                setPage(1);
              }}
            >
              <option value="">All Statuses</option>
              <option value="COMPLETED">COMPLETED</option>
              <option value="IN_PROGRESS">IN_PROGRESS</option>
              <option value="FAILED">FAILED</option>
              <option value="PRUNED">PRUNED</option>
            </select>
          </div>
        </div>

        {loadingLogs ? (
          <FeedbackStates.Loading label="Loading backup logs..." />
        ) : logs.length === 0 ? (
          <FeedbackStates.Empty
            message="No backup history recorded yet. You can trigger an on-demand encrypted backup now."
            action={{
              label: 'Trigger Backup Now',
              onClick: handleTriggerBackup,
              id: 'empty-trigger-backup-btn',
            }}
          />
        ) : (
          <>
            <div className={styles.tableWrapper}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Created At</th>
                    <th>Status</th>
                    <th>Type</th>
                    <th>File Size</th>
                    <th>Checksum (SHA-256)</th>
                    <th>Storage Driver Path</th>
                    <th>Retention Expiry</th>
                    <th>Triggered By</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((log) => {
                    const statusClass =
                      log.status === 'COMPLETED'
                        ? styles.badgeSuccess
                        : log.status === 'FAILED'
                        ? styles.badgeDanger
                        : log.status === 'IN_PROGRESS'
                        ? styles.badgeWarning
                        : styles.badgeMuted;

                    return (
                      <tr key={log.id}>
                        <td>{formatDate(log.createdAt)}</td>
                        <td>
                          <span className={`${styles.badge} ${statusClass}`}>{log.status}</span>
                          {log.errorMessage && (
                            <div
                              style={{
                                color: 'var(--color-danger)',
                                fontSize: 'var(--text-xs)',
                                marginTop: 4,
                              }}
                            >
                              {log.errorMessage}
                            </div>
                          )}
                        </td>
                        <td>{log.backupType}</td>
                        <td>{formatBytes(log.sizeBytes)}</td>
                        <td>
                          {log.checksum ? (
                            <span className={styles.codeText} title={log.checksum}>
                              {log.checksum.slice(0, 16)}…
                            </span>
                          ) : (
                            '—'
                          )}
                        </td>
                        <td>
                          <span className={styles.codeText}>{log.storageLocation}</span>
                        </td>
                        <td>{formatDate(log.retentionExpiresAt)}</td>
                        <td>
                          <span className={styles.codeText}>{log.triggeredBy}</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className={styles.pagination}>
                <span className={styles.paginationInfo}>
                  Page {page} of {totalPages} ({totalLogs} records)
                </span>
                <div className={styles.paginationButtons}>
                  <button
                    type="button"
                    className={styles.pageBtn}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page <= 1}
                  >
                    Previous
                  </button>
                  <button
                    type="button"
                    className={styles.pageBtn}
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={page >= totalPages}
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}
