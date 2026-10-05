'use client';

import React, { useState } from 'react';
import { can, type AuditLogRecord, type Role } from '@cold-storage/contracts';
import { FeedbackStates } from '@/components/ui/FeedbackStates';
import {
  ACCESS_MESSAGES,
  EMPTY_MESSAGES,
  ERROR_TITLES,
  LOADING_LABELS,
} from '@/components/ui/stateCopy';
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
    totalLogs,
    totalPages,
    page,
    setPage,
    pageSize,
    loading,
    error,
    searchTerm,
    setSearchTerm,
    severityFilter,
    setSeverityFilter,
    eventTypeFilter,
    setEventTypeFilter,
    filteredLogs,
    fetchLogs,
  } = useAuditLogs(canViewAudit);

  const [selectedLog, setSelectedLog] = useState<AuditLogRecord | null>(null);

  if (!canViewAudit) {
    return (
      <FeedbackStates.Error
        title={ERROR_TITLES.accessRestricted}
        message={ACCESS_MESSAGES.audit}
      />
    );
  }

  return (
    <div className={styles.page}>
      <div className={styles.headerRow}>
        <div className={styles.titleArea}>
          <h1 className={styles.pageTitle}>Immutable Audit Logs</h1>
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
        <FeedbackStates.Loading label={LOADING_LABELS.audit} />
      ) : error ? (
        <FeedbackStates.Error
          title={ERROR_TITLES.audit}
          message={error}
          onRetry={() => void fetchLogs()}
        />
      ) : logs.length === 0 ? (
        <FeedbackStates.Empty message={EMPTY_MESSAGES.audit} />
      ) : filteredLogs.length === 0 ? (
        <FeedbackStates.Empty message={`No audit logs matching "${searchTerm}".`} />
      ) : (
        <AuditTable
          logs={filteredLogs}
          page={page}
          pageSize={pageSize}
          totalPages={totalPages}
          totalLogs={totalLogs}
          onPageChange={setPage}
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
