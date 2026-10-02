'use client';

import React, { useState } from 'react';
import { can, type AuditLogRecord, type Role } from '@cold-storage/contracts';
import { FeedbackStates } from '@/components/ui/FeedbackStates';
import { useAuth } from '@/context/AuthContext';
import { AuditDetailModal } from './components/AuditDetailModal';
import { AuditFilterToolbar } from './components/AuditFilterToolbar';
import { AuditTable } from './components/AuditTable';
import { useAuditLogs } from './hooks/useAuditLogs';
import styles from './page.module.css';

export default function AuditLogsPage() {
  const { user } = useAuth();
  const userRole = (user?.role ?? 'READ_ONLY') as Role;
  const canViewAudit = can(userRole, 'audit:view');

  const {
    logs,
    loading,
    error,
    searchTerm,
    setSearchTerm,
    severityFilter,
    setSeverityFilter,
    eventTypeFilter,
    setEventTypeFilter,
    filteredLogs,
    currentFacilityName,
    fetchLogs,
  } = useAuditLogs(canViewAudit);

  const [selectedLog, setSelectedLog] = useState<AuditLogRecord | null>(null);

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

      <AuditFilterToolbar
        searchTerm={searchTerm}
        onSearchChange={setSearchTerm}
        severityFilter={severityFilter}
        onSeverityChange={setSeverityFilter}
        eventTypeFilter={eventTypeFilter}
        onEventTypeChange={setEventTypeFilter}
      />

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
        <AuditTable
          logs={filteredLogs}
          onInspect={setSelectedLog}
        />
      )}

      {selectedLog && (
        <AuditDetailModal
          log={selectedLog}
          onClose={() => setSelectedLog(null)}
        />
      )}
    </div>
  );
}
