'use client';

import { useCallback, useEffect, useState } from 'react';
import type { BackupLogRecord, BackupStatus, BackupStatusResponse } from '@cold-storage/contracts';
import { requestWithAuth } from '@/lib/api-client';

export function useBackupData(canManage: boolean) {
  const [backupStatus, setBackupStatus] = useState<BackupStatusResponse | null>(null);
  const [loadingStatus, setLoadingStatus] = useState(true);

  const [logs, setLogs] = useState<BackupLogRecord[]>([]);
  const [totalLogs, setTotalLogs] = useState(0);
  const [page, setPage] = useState(1);
  const limit = 15;
  const [statusFilter, setStatusFilter] = useState<'' | BackupStatus>('');
  const [loadingLogs, setLoadingLogs] = useState(true);

  const [triggering, setTriggering] = useState(false);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const fetchStatus = useCallback(async () => {
    if (!canManage) return;
    setLoadingStatus(true);
    try {
      const res = await requestWithAuth('/api/backups/status');
      if (res.ok) {
        const data = (await res.json()) as BackupStatusResponse;
        setBackupStatus(data);
      }
    } catch {
      // Handled silently
    } finally {
      setLoadingStatus(false);
    }
  }, [canManage]);

  const fetchLogs = useCallback(async () => {
    if (!canManage) return;
    setLoadingLogs(true);
    try {
      const params = new URLSearchParams();
      params.set('page', String(page));
      params.set('limit', String(limit));
      if (statusFilter) {
        params.set('status', statusFilter);
      }
      const res = await requestWithAuth(`/api/backups?${params.toString()}`);
      if (res.ok) {
        const data = (await res.json()) as {
          items: BackupLogRecord[];
          total: number;
          page: number;
          limit: number;
        };
        setLogs(data.items || []);
        setTotalLogs(data.total || 0);
      }
    } catch {
      // Handled silently
    } finally {
      setLoadingLogs(false);
    }
  }, [canManage, page, limit, statusFilter]);

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
        const err = (await res.json()) as { error?: string };
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
