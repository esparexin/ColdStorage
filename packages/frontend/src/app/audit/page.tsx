'use client';

import React, { useState } from 'react';
import { type AuditLogRecord } from '@cold-storage/contracts';
import { PageHeader } from '@/components/ui';
import { FeedbackStates } from '@/components/ui/FeedbackStates';
import {
  ACCESS_MESSAGES,
  EMPTY_MESSAGES,
  ERROR_TITLES,
  LOADING_LABELS,
} from '@/components/ui/stateCopy';
import { usePermissions } from '@/hooks/usePermissions';
import { AuditDetailModal } from './components/AuditDetailModal';
import { AuditFilterToolbar } from './components/AuditFilterToolbar';
import { AuditTable } from './components/AuditTable';
import { useAuditLogs } from './hooks/useAuditLogs';
import styles from './page.module.css';

export default function AuditLogsPage() {
  const { hasPermission } = usePermissions();
  const canViewAudit = hasPermission('audit:view');

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
      <PageHeader title="Immutable Audit Logs" />

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
