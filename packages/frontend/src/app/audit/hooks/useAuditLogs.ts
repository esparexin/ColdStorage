'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  hasGlobalFacilityScope,
  type AuditEventType,
  type AuditLogRecord,
  type AuditLogsResponse,
  type AuditSeverity,
  type Role,
} from '@cold-storage/contracts';
import { useAuth } from '@/context/AuthContext';
import { useFacility } from '@/context/FacilityContext';
import { useRequestGuard } from '@/hooks/useRequestGuard';
import { requestWithAuth } from '@/lib/api-client';

export const AUDIT_PAGE_SIZE = 50;

export function useAuditLogs(canViewAudit: boolean) {
  const { user } = useAuth();
  const { selectedFacilityId, availableFacilities } = useFacility();
  const userRole = (user?.role ?? 'READ_ONLY') as Role;

  const [logs, setLogs] = useState<AuditLogRecord[]>([]);
  const [totalLogs, setTotalLogs] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const beginRequest = useRequestGuard();
  const [error, setError] = useState<string | null>(null);

  const [searchTerm, setSearchTermRaw] = useState('');
  const [severityFilter, setSeverityFilterRaw] = useState<'' | AuditSeverity>('');
  const [eventTypeFilter, setEventTypeFilterRaw] = useState<'' | AuditEventType>('');

  // Any filter change invalidates the current page number.
  const setSearchTerm = useCallback((v: string) => { setSearchTermRaw(v); setPage(1); }, []);
  const setSeverityFilter = useCallback((v: '' | AuditSeverity) => { setSeverityFilterRaw(v); setPage(1); }, []);
  const setEventTypeFilter = useCallback((v: '' | AuditEventType) => { setEventTypeFilterRaw(v); setPage(1); }, []);

  const fetchLogs = useCallback(async () => {
    if (!canViewAudit) return;
    setLoading(true);
    setError(null);
    const isCurrent = beginRequest();
    try {
      const params = new URLSearchParams();
      params.set('page', String(page));
      params.set('limit', String(AUDIT_PAGE_SIZE));
      if (selectedFacilityId && !hasGlobalFacilityScope(userRole)) {
        params.set('facilityId', selectedFacilityId);
      }
      if (severityFilter) params.set('severity', severityFilter);
      if (eventTypeFilter) params.set('eventType', eventTypeFilter);

      const res = await requestWithAuth(`/api/audit-logs?${params.toString()}`);
      if (!res.ok) {
        const err = (await res.json()) as { error?: string };
        throw new Error(err.error ?? `HTTP ${res.status}`);
      }

      const data = (await res.json()) as AuditLogsResponse;
      if (!isCurrent()) return;
      setLogs(data.logs ?? []);
      setTotalLogs(data.totalCount ?? 0);
      setTotalPages(data.totalPages ?? 0);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load audit logs');
    } finally {
      setLoading(false);
    }
  }, [canViewAudit, selectedFacilityId, userRole, page, severityFilter, eventTypeFilter]);

  useEffect(() => {
    void fetchLogs();
  }, [fetchLogs]);

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

  const currentFacilityName =
    availableFacilities.find((f) => f.id === selectedFacilityId)?.name ?? 'All Facilities';

  return {
    logs,
    totalLogs,
    totalPages,
    page,
    setPage,
    pageSize: AUDIT_PAGE_SIZE,
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
  };
}
