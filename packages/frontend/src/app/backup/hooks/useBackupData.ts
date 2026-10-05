'use client';

import { useCallback, useEffect, useState } from 'react';
import type { BackupLogRecord, BackupStatus, BackupStatusResponse } from '@cold-storage/contracts';
import { useRequestGuard } from '@/hooks/useRequestGuard';
import { requestWithAuth } from '@/lib/api-client';

export const BACKUP_PAGE_SIZE = 15;

export function useBackupData(canManage: boolean) {
  const [backupStatus, setBackupStatus] = useState<BackupStatusResponse | null>(null);
  const [loadingStatus, setLoadingStatus] = useState(true);

  const [logs, setLogs] = useState<BackupLogRecord[]>([]);
  const [totalLogs, setTotalLogs] = useState(0);
  const [page, setPage] = useState(1);
  const limit = BACKUP_PAGE_SIZE;
  const [statusFilter, setStatusFilterRaw] = useState<'' | BackupStatus>('');
  const [loadingLogs, setLoadingLogs] = useState(true);

  const [triggering, setTriggering] = useState(false);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [logsError, setLogsError] = useState<string | null>(null);
  const beginRequest = useRequestGuard();

  // A narrower filter can leave the current page number past the end.
  const setStatusFilter = useCallback((status: '' | BackupStatus) => {
    setStatusFilterRaw(status);
    setPage(1);
  }, []);

  const fetchStatus = useCallback(async () => {
    if (!canManage) return;
    setLoadingStatus(true);
    setStatusError(null);
    const isCurrent = beginRequest();
    try {
      const res = await requestWithAuth('/api/backups/status');
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? `Failed to load backup status (HTTP ${res.status})`);
      }
      const data = (await res.json()) as BackupStatusResponse;
      if (!isCurrent()) return;
      setBackupStatus(data);
    } catch (err: unknown) {
      if (!isCurrent()) return;
      setStatusError(err instanceof Error ? err.message : 'Failed to load backup status');
    } finally {
      setLoadingStatus(false);
    }
  }, [beginRequest, canManage]);

  const fetchLogs = useCallback(async () => {
    if (!canManage) return;
    setLoadingLogs(true);
    setLogsError(null);
    const isCurrent = beginRequest();
    try {
      const params = new URLSearchParams();
      params.set('page', String(page));
      params.set('limit', String(limit));
      if (statusFilter) {
        params.set('status', statusFilter);
      }
      const res = await requestWithAuth(`/api/backups?${params.toString()}`);
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? `Failed to load backup logs (HTTP ${res.status})`);
      }
      const data = (await res.json()) as {
        items: BackupLogRecord[];
        total: number;
        page: number;
        limit: number;
      };
      if (!isCurrent()) return;
      setLogs(data.items || []);
      setTotalLogs(data.total || 0);
    } catch (err: unknown) {
      if (!isCurrent()) return;
      setLogsError(err instanceof Error ? err.message : 'Failed to load backup logs');
      setLogs([]);
      setTotalLogs(0);
    } finally {
      setLoadingLogs(false);
    }
  }, [beginRequest, canManage, page, limit, statusFilter]);

  useEffect(() => {
    if (canManage) {
      void fetchStatus();
      void fetchLogs();
    }
  }, [canManage, fetchStatus, fetchLogs]);

  const handleTriggerBackup = async () => {
    if (triggering) return;
    setTriggering(true);
    setActionSuccess(null);
    setActionError(null);

    try {
      const res = await requestWithAuth('/api/backups/trigger', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ backupType: 'MANUAL' }),
      });

      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error || `Backup trigger failed (HTTP ${res.status})`);
      }

      const data = (await res.json()) as { message?: string; filename?: string };
      setActionSuccess(data.message || `Encrypted backup completed: ${data.filename || ''}`);
      void fetchStatus();
      void fetchLogs();
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : 'Backup execution failed');
    } finally {
      setTriggering(false);
    }
  };

  const totalPages = Math.ceil(totalLogs / limit);

  return {
    backupStatus,
    loadingStatus,
    statusError,
    logsError,
    logs,
    totalLogs,
    page,
    setPage,
    limit,
    statusFilter,
    setStatusFilter,
    loadingLogs,
    triggering,
    actionSuccess,
    actionError,
    totalPages,
    fetchStatus,
    fetchLogs,
    handleTriggerBackup,
  };
}
