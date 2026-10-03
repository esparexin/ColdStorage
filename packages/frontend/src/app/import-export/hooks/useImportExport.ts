'use client';

import { useState } from 'react';
import { requestWithAuth } from '@/lib/api-client';
import type { ImportSummaryResult } from '../types';

export function useImportExport(selectedFacilityId: string | null) {
  const [importTarget, setImportTarget] = useState<'customers' | 'grns'>('customers');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<ImportSummaryResult | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);

  const [exportingType, setExportingType] = useState<string | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.name.endsWith('.csv')) {
      setImportError('Only .csv files are supported for bulk imports.');
      return;
    }
    setSelectedFile(file);
    setImportResult(null);
    setImportError(null);
  };

  const handleImportSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFacilityId || !selectedFile) return;

    setImporting(true);
    setImportError(null);
    setImportResult(null);

    try {
      const formData = new FormData();
      formData.append('file', selectedFile);

      const res = await requestWithAuth(
        `/api/facilities/${encodeURIComponent(selectedFacilityId)}/import/${importTarget}`,
        {
          method: 'POST',
          body: formData,
        },
      );

      if (!res.ok) {
        const err = (await res.json()) as { error?: string };
        throw new Error(err.error ?? `Import failed with HTTP ${res.status}`);
      }

      const summary = (await res.json()) as ImportSummaryResult;
      setImportResult(summary);
      setSelectedFile(null);
    } catch (err: unknown) {
      setImportError(err instanceof Error ? err.message : 'Import failed');
    } finally {
      setImporting(false);
    }
  };

  const handleExportDownload = async (endpoint: string, filename: string) => {
    if (!selectedFacilityId) return;
    setExportingType(endpoint);

    try {
      const res = await requestWithAuth(
        `/api/facilities/${encodeURIComponent(selectedFacilityId)}/export/${endpoint}`,
      );

      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? `Export failed with HTTP ${res.status}`);
      }

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err: unknown) {
      setExportError(err instanceof Error ? err.message : 'Export failed');
    } finally {
      setExportingType(null);
    }
  };

  return {
    exportError,
    setExportError,
    importTarget,
    setImportTarget,
    selectedFile,
    importing,
    importResult,
    importError,
    exportingType,
    handleFileChange,
    handleImportSubmit,
    handleExportDownload,
  };
}
