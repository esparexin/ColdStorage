'use client';

import React from 'react';
import type { BackupLogRecord, BackupStatus } from '@cold-storage/contracts';
import { FeedbackStates } from '@/components/ui/FeedbackStates';
import { formatBytes, formatDate } from '../utils';
import styles from '../page.module.css';

interface BackupLogTableProps {
  logs: BackupLogRecord[];
  totalLogs: number;
  loading: boolean;
  page: number;
  totalPages: number;
  statusFilter: '' | BackupStatus;
  onStatusFilterChange: (status: '' | BackupStatus) => void;
  onPageChange: (newPage: number) => void;
  onTriggerBackup: () => void;
}

export function BackupLogTable({
  logs,
  totalLogs,
  loading,
  page,
  totalPages,
  statusFilter,
  onStatusFilterChange,
  onPageChange,
  onTriggerBackup,
}: BackupLogTableProps) {
  return (
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
            onChange={(e) => onStatusFilterChange(e.target.value as '' | BackupStatus)}
          >
            <option value="">All Statuses</option>
            <option value="COMPLETED">COMPLETED</option>
            <option value="IN_PROGRESS">IN_PROGRESS</option>
            <option value="FAILED">FAILED</option>
            <option value="PRUNED">PRUNED</option>
          </select>
        </div>
      </div>

      {loading ? (
        <FeedbackStates.Loading label="Loading backup logs..." />
      ) : logs.length === 0 ? (
        <FeedbackStates.Empty
          message="No backup history recorded yet. You can trigger an on-demand encrypted backup now."
          action={{
            label: 'Trigger Backup Now',
            onClick: onTriggerBackup,
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

          {totalPages > 1 && (
            <div className={styles.pagination}>
              <span className={styles.paginationInfo}>
                Page {page} of {totalPages} ({totalLogs} records)
              </span>
              <div className={styles.paginationButtons}>
                <button
                  type="button"
                  className={styles.pageBtn}
                  onClick={() => onPageChange(Math.max(1, page - 1))}
                  disabled={page <= 1}
                >
                  Previous
                </button>
                <button
                  type="button"
                  className={styles.pageBtn}
                  onClick={() => onPageChange(Math.min(totalPages, page + 1))}
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
  );
}
