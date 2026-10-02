'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Eye, Search, X } from 'lucide-react';
import {
  can,
  type AuditEventType,
  type AuditLogRecord,
  type AuditSeverity,
  type Role,
} from '@cold-storage/contracts';
import { DataTable, type DataTableColumn } from '@/components/ui/DataTable';
import { FeedbackStates } from '@/components/ui/FeedbackStates';
import { useAuth } from '@/context/AuthContext';
import { useFacility } from '@/context/FacilityContext';
import { requestWithAuth } from '@/lib/api-client';
import styles from './page.module.css';

export default function AuditLogsPage() {
  const { user } = useAuth();
  const { selectedFacilityId, availableFacilities } = useFacility();

  const userRole = (user?.role ?? 'READ_ONLY') as Role;
  const canViewAudit = can(userRole, 'audit:view');

  const [logs, setLogs] = useState<AuditLogRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [severityFilter, setSeverityFilter] = useState<'' | AuditSeverity>('');
  const [eventTypeFilter, setEventTypeFilter] = useState<'' | AuditEventType>('');

  // Selected Log for detail modal
  const [selectedLog, setSelectedLog] = useState<AuditLogRecord | null>(null);

  const fetchLogs = useCallback(async () => {
    if (!canViewAudit) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set('limit', '100');
      if (selectedFacilityId && user?.role !== 'SUPER_ADMIN') {
        params.set('facilityId', selectedFacilityId);
      }
      if (severityFilter) params.set('severity', severityFilter);
      if (eventTypeFilter) params.set('eventType', eventTypeFilter);

      const res = await requestWithAuth(`/api/audit-logs?${params.toString()}`);
      if (!res.ok) {
        const err = (await res.json()) as { error?: string };
        throw new Error(err.error ?? `HTTP ${res.status}`);
      }

      const data = (await res.json()) as { items?: AuditLogRecord[] };
      setLogs(data.items ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load audit logs');
    } finally {
      setLoading(false);
    }
  }, [canViewAudit, selectedFacilityId, user?.role, severityFilter, eventTypeFilter]);

  useEffect(() => {
    void fetchLogs();
  }, [fetchLogs]);

  // Filtered in-memory records
  const filteredLogs = useMemo(() => {
    if (!searchTerm.trim()) return logs;
    const term = searchTerm.toLowerCase();
    return logs.filter(
      (l) =>
        l.username.toLowerCase().includes(term) ||
        l.eventType.toLowerCase().includes(term) ||
        l.resource.toLowerCase().includes(term) ||
        l.ipAddress.includes(term),
    );
  }, [logs, searchTerm]);

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
          onClick={() => setSelectedLog(r)}
        >
          <Eye size={13} aria-hidden="true" />
          Inspect
        </button>
      ),
    },
  ];

  const currentFacilityName =
    availableFacilities.find((f) => f.id === selectedFacilityId)?.name ?? 'All Facilities';

  if (!canViewAudit) {
    return (
      <FeedbackStates.Error
        title="Access Restricted"
        message="Only Administrators and Super Administrators have authorization to inspect audit trails."
      />
    );
  }

  return (
    <div className={styles.page}>
      <div className={styles.headerRow}>
        <div className={styles.titleArea}>
          <h1 className={styles.pageTitle}>Immutable Audit Logs</h1>
          <p className={styles.pageSub}>
            Security events, sensitive transactions, and access logs for {currentFacilityName}.
          </p>
        </div>
      </div>

      {/* Toolbar */}
      <div className={styles.toolbar}>
        <div className={styles.searchGroup}>
          <Search size={16} color="var(--color-text-muted)" aria-hidden="true" />
          <input
            type="text"
            placeholder="Search Actor, Event, Resource, IP..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className={styles.searchInput}
          />
        </div>

        <div className={styles.filtersGroup}>
          <select
            aria-label="Filter by Severity"
            className={styles.filterSelect}
            value={severityFilter}
            onChange={(e) => setSeverityFilter(e.target.value as '' | AuditSeverity)}
          >
            <option value="">All Severities</option>
            <option value="INFO">INFO</option>
            <option value="WARN">WARN</option>
            <option value="SECURITY">SECURITY</option>
            <option value="CRITICAL">CRITICAL</option>
          </select>

          <select
            aria-label="Filter by Event Action"
            className={styles.filterSelect}
            value={eventTypeFilter}
            onChange={(e) => setEventTypeFilter(e.target.value as '' | AuditEventType)}
          >
            <option value="">All Event Types</option>
            <option value="AUTH_LOGIN_SUCCESS">AUTH_LOGIN_SUCCESS</option>
            <option value="AUTH_LOGIN_FAILED">AUTH_LOGIN_FAILED</option>
            <option value="GRN_CREATED">GRN_CREATED</option>
            <option value="INVENTORY_PUTAWAY">INVENTORY_PUTAWAY</option>
            <option value="DELIVERY_ISSUED">DELIVERY_ISSUED</option>
            <option value="DELIVERY_REVERSED">DELIVERY_REVERSED</option>
            <option value="RENT_PAYMENT_COLLECTED">RENT_PAYMENT_COLLECTED</option>
            <option value="SETTINGS_UPDATED">SETTINGS_UPDATED</option>
            <option value="BACKUP_TRIGGERED">BACKUP_TRIGGERED</option>
            <option value="ACCESS_DENIED">ACCESS_DENIED</option>
          </select>
        </div>
      </div>

      {/* Table / Empty / Loading / Error */}
      {loading ? (
        <FeedbackStates.Loading label="Loading audit logs..." />
      ) : error ? (
        <FeedbackStates.Error
          title="Error loading audit logs"
          message={error}
          onRetry={() => void fetchLogs()}
        />
      ) : logs.length === 0 ? (
        <FeedbackStates.Empty message="No audit log events recorded yet." />
      ) : (
        <DataTable
          columns={columns}
          rows={filteredLogs}
          rowKey={(r) => r.id}
          caption="Audit Log Events"
        />
      )}

      {/* Details Modal */}
      {selectedLog && (
        <div className={styles.modalBackdrop} role="dialog" aria-modal="true">
          <div className={styles.modalCard}>
            <div className={styles.modalHeader}>
              <h2 className={styles.modalTitle}>
                Audit Event: {selectedLog.eventType}
              </h2>
              <button
                type="button"
                className={styles.modalClose}
                onClick={() => setSelectedLog(null)}
              >
                <X size={20} aria-hidden="true" />
              </button>
            </div>

            <div className={styles.modalBody}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px', fontSize: 'var(--text-xs)' }}>
                <div>
                  <strong>Timestamp:</strong> {new Date(selectedLog.timestamp).toISOString()}
                </div>
                <div>
                  <strong>Severity:</strong> {selectedLog.severity}
                </div>
                <div>
                  <strong>User:</strong> {selectedLog.username} ({selectedLog.userId})
                </div>
                <div>
                  <strong>Role:</strong> {selectedLog.userRole}
                </div>
                <div>
                  <strong>IP Address:</strong> {selectedLog.ipAddress}
                </div>
                <div>
                  <strong>Facility:</strong> {selectedLog.facilityId || 'Global'}
                </div>
              </div>

              <div>
                <strong style={{ fontSize: 'var(--text-xs)', textTransform: 'uppercase' }}>
                  Event Details Payload:
                </strong>
                <pre className={styles.jsonBox}>
                  {JSON.stringify(selectedLog.details, null, 2)}
                </pre>
              </div>
            </div>

            <div className={styles.modalFooter}>
              <button
                type="button"
                className={styles.cancelBtn}
                onClick={() => setSelectedLog(null)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
