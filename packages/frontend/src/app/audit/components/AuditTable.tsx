'use client';

import React from 'react';
import { Eye } from 'lucide-react';
import type { AuditLogRecord } from '@cold-storage/contracts';
import { DataTable, type DataTableColumn } from '@/components/ui/DataTable';
import { Badge, Button } from '@/components/ui';
import { formatDisplayDate } from '@/lib/date-format';

interface AuditTableProps {
  logs: AuditLogRecord[];
  page: number;
  pageSize: number;
  totalPages: number;
  totalLogs: number;
  onPageChange: (page: number) => void;
  onInspect: (record: AuditLogRecord) => void;
}

export function AuditTable({
  logs,
  page,
  pageSize,
  totalPages,
  totalLogs,
  onPageChange,
  onInspect,
}: AuditTableProps) {
  const columns: DataTableColumn<AuditLogRecord>[] = [
    {
      key: 'timestamp',
      header: 'Timestamp',
      sortable: true,
      sortType: 'date',
      sortAccessor: (r) => r.timestamp,
      render: (r) => (
        <span style={{ fontSize: 'var(--text-xs)' }}>
          {formatDisplayDate(r.timestamp, { includeTime: true })}
        </span>
      ),
    },
    {
      key: 'severity',
      header: 'Severity',
      align: 'center',
      sortable: true,
      sortType: 'text',
      sortAccessor: (r) => r.severity,
      render: (r) => (
        <Badge
          variant={
            r.severity === 'CRITICAL' || r.severity === 'SECURITY'
              ? 'danger'
              : r.severity === 'WARN'
                ? 'warning'
                : 'neutral'
          }
        >
          {r.severity}
        </Badge>
      ),
    },
    {
      key: 'eventType',
      header: 'Event Action',
      sortable: true,
      sortType: 'text',
      sortAccessor: (r) => r.eventType,
      render: (r) => (
        <span
          style={{
            fontWeight: 'var(--font-semibold)',
            fontFamily: 'var(--font-mono)',
            fontSize: 'var(--text-sm)',
          }}
        >
          {r.eventType}
        </span>
      ),
    },
    {
      key: 'actor',
      header: 'Actor / Role',
      sortable: true,
      sortType: 'text',
      sortAccessor: (r) => r.username,
      render: (r) => (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <span style={{ fontWeight: 'var(--font-semibold)' }}>{r.username}</span>
          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
            {r.userRole}
          </span>
        </div>
      ),
    },
    {
      key: 'resource',
      header: 'Resource',
      sortable: true,
      sortType: 'text',
      sortAccessor: (r) => r.resource,
      render: (r) => (
        <span style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)' }}>
          {r.resource}
        </span>
      ),
    },
    {
      key: 'ip',
      header: 'IP / Network',
      render: (r) => (
        <span style={{ fontSize: 'var(--text-xs)', fontFamily: 'var(--font-mono)' }}>
          {r.ipAddress}
        </span>
      ),
    },
    {
      key: 'actions',
      header: 'Payload',
      align: 'right',
      render: (r) => (
        <Button
          variant="outline"
          size="sm"
          onClick={(e) => {
            e.stopPropagation();
            onInspect(r);
          }}
          aria-label={`Inspect payload for ${r.eventType} event ${r.id}`}
          leftIcon={<Eye size={13} aria-hidden="true" />}
        >
          Inspect
        </Button>
      ),
    },
  ];

  return (
    <DataTable
      columns={columns}
      rows={logs}
      rowKey={(r) => r.id}
      caption="Audit Log Events"
      pagination={{ page, pageSize, totalPages, totalRecords: totalLogs, onPageChange }}
      onRowClick={onInspect}
    />
  );
}
