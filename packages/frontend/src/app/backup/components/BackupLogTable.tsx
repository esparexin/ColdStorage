'use client';

import React from 'react';
import type { BackupLogRecord, BackupStatus } from '@cold-storage/contracts';
import { Badge, Select } from '@/components/ui';
import { DataTable, type DataTableColumn } from '@/components/ui/DataTable';
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
  /** Omitted when backups are unconfigured, which hides the empty-state action. */
  onTriggerBackup?: () => void;
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
  const columns: DataTableColumn<BackupLogRecord>[] = [
    {
      key: 'createdAt',
      header: 'Created At',
      render: (log) => formatDate(log.createdAt),
    },
    {
      key: 'status',
      header: 'Status',
      render: (log) => {
        const variant =
          log.status === 'COMPLETED'
            ? 'success'
            : log.status === 'FAILED'
            ? 'danger'
            : log.status === 'IN_PROGRESS'
            ? 'warning'
            : 'neutral';

        return (
          <div>
            <Badge variant={variant}>{log.status}</Badge>
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
          </div>
        );
      },
    },
    {
      key: 'backupType',
      header: 'Type',
      render: (log) => log.backupType,
    },
    {
      key: 'sizeBytes',
      header: 'File Size',
      render: (log) => formatBytes(log.sizeBytes),
    },
    {
      key: 'checksum',
      header: 'Checksum (SHA-256)',
      render: (log) =>
        log.checksum ? (
          <span className={styles.codeText} title={log.checksum}>
            {log.checksum.slice(0, 16)}…
          </span>
        ) : (
          '—'
        ),
    },
    {
      key: 'storageLocation',
      header: 'Archive File',
      // The stored value is an absolute path on the backend host. Only the file name is
      // meaningful to an operator, and the full path should not be exposed to the browser.
      render: (log) => (
        <span className={styles.codeText}>{log.storageLocation.split('/').pop()}</span>
      ),
    },
    {
      key: 'retentionExpiresAt',
      header: 'Retention Expiry',
      render: (log) => formatDate(log.retentionExpiresAt),
    },
    {
      key: 'triggeredBy',
      header: 'Triggered By',
      render: (log) => <span className={styles.codeText}>{log.triggeredBy}</span>,
    },
  ];

  return (
    <section className={styles.tableSection}>
      <div className={styles.tableHeader}>
        <div className={styles.tableTitleArea}>
          <h2>Encrypted Backup Log Ledger</h2>
          <span className={styles.tableCount}>({totalLogs} total entries)</span>
        </div>
        <div className={styles.filterControls}>
          <Select
            id="status-filter"
            aria-label="Filter backups by status"
            className={styles.selectInput}
            value={statusFilter}
            onChange={(e) => onStatusFilterChange(e.target.value as '' | BackupStatus)}
          >
            <option value="">All Statuses</option>
            <option value="COMPLETED">COMPLETED</option>
            <option value="IN_PROGRESS">IN_PROGRESS</option>
            <option value="FAILED">FAILED</option>
            <option value="PRUNED">PRUNED</option>
          </Select>
        </div>
      </div>

      <DataTable
        columns={columns}
        rows={logs}
        rowKey={(log) => log.id}
        caption="Encrypted Backup Log Ledger"
        loading={loading}
        loadingLabel="Loading backup logs..."
        emptyMessage="No backup history recorded yet."
        emptyAction={
          onTriggerBackup
            ? {
                label: 'Trigger Backup Now',
                onClick: onTriggerBackup,
                id: 'empty-trigger-backup-btn',
              }
            : undefined
        }
        pagination={
          totalPages > 1
            ? {
                page,
                totalPages,
                totalRecords: totalLogs,
                onPageChange,
              }
            : undefined
        }
      />
    </section>
  );
}
