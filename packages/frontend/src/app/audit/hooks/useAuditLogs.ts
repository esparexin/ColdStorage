'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { AuditEventType, AuditLogRecord, AuditSeverity } from '@cold-storage/contracts';
import { useAuth } from '@/context/AuthContext';
import { useFacility } from '@/context/FacilityContext';
import { requestWithAuth } from '@/lib/api-client';

export function useAuditLogs(canViewAudit: boolean) {
  const { user } = useAuth();
  const { selectedFacilityId, availableFacilities } = useFacility();

  const [logs, setLogs] = useState<AuditLogRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [searchTerm, setSearchTerm] = useState('');
  const [severityFilter, setSeverityFilter] = useState<'' | AuditSeverity>('');
  const [eventTypeFilter, setEventTypeFilter] = useState<'' | AuditEventType>('');

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
