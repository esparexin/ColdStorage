'use client';

import React from 'react';
import { Eye } from 'lucide-react';
import type { AuditLogRecord } from '@cold-storage/contracts';
import { DataTable, type DataTableColumn } from '@/components/ui/DataTable';
import styles from '../page.module.css';

interface AuditTableProps {
  logs: AuditLogRecord[];
  onInspect: (record: AuditLogRecord) => void;
}

export function AuditTable({ logs, onInspect }: AuditTableProps) {
  const columns: DataTableColumn<AuditLogRecord>[] = [
    {
      key: 'timestamp',
      header: 'Timestamp',
      render: (r) => (
        <span style={{ fontSize: 'var(--text-xs)' }}>
          {new Date(r.timestamp).toLocaleString('en-IN', {
            dateStyle: 'medium',
            timeStyle: 'medium',
          })}
        </span>
      ),
    },
    {
      key: 'severity',
      header: 'Severity',
      align: 'center',
      render: (r) => (
        <span
          className={
            r.severity === 'CRITICAL'
              ? styles.badgeCritical
              : r.severity === 'SECURITY'
                ? styles.badgeSecurity
                : r.severity === 'WARN'
                  ? styles.badgeWarn
                  : styles.badgeInfo
          }
        >
          {r.severity}
        </span>
      ),
    },
    {
      key: 'eventType',
      header: 'Event Action',
      render: (r) => (
        <span style={{ fontWeight: 600, fontFamily: 'var(--font-mono, monospace)', fontSize: 'var(--text-xs)' }}>
          {r.eventType}
        </span>
      ),
    },
    {
      key: 'actor',
      header: 'Actor / Role',
      render: (r) => (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <span style={{ fontWeight: 600 }}>{r.username}</span>
          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
            {r.userRole}
          </span>
        </div>
      ),
    },
    {
      key: 'resource',
      header: 'Resource',
      render: (r) => (
        <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)' }}>
          {r.resource}
        </span>
      ),
    },
    {
      key: 'ip',
      header: 'IP / Network',
      render: (r) => (
        <span style={{ fontSize: 'var(--text-xs)', fontFamily: 'monospace' }}>
          {r.ipAddress}
        </span>
      ),
    },
    {
      key: 'actions',
      header: 'Payload',
      align: 'right',
      render: (r) => (
        <button
          type="button"
          className={styles.actionBtn}
          onClick={() => onInspect(r)}
        >
          <Eye size={13} aria-hidden="true" />
          Inspect
        </button>
      ),
    },
  ];

  return (
    <DataTable
      columns={columns}
      rows={logs}
      rowKey={(r) => r.id}
      caption="Audit Log Events"
    />
  );
}
