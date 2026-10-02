'use client';

import React, { useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  Upload,
} from 'lucide-react';
import { can, type Role } from '@cold-storage/contracts';
import { FeedbackStates } from '@/components/ui/FeedbackStates';
import { useAuth } from '@/context/AuthContext';
import { useFacility } from '@/context/FacilityContext';
import { requestWithAuth } from '@/lib/api-client';
import styles from './page.module.css';

interface ImportSummaryResult {
  totalRows: number;
  inserted: number;
  updated: number;
  skipped: number;
  errors: string[];
}

export default function ImportExportPage() {
  const { user } = useAuth();
  const { selectedFacilityId, availableFacilities } = useFacility();

  const userRole = (user?.role ?? 'READ_ONLY') as Role;
  const canImport = can(userRole, 'import:execute');
  const canExport = can(userRole, 'export:execute');

  // Import states
  const [importTarget, setImportTarget] = useState<'customers' | 'grns'>('customers');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<ImportSummaryResult | null>(null);
  const [importError, setImportError] = useState<string | null>(null);

  // Export states
  const [exportingType, setExportingType] = useState<string | null>(null);

  const currentFacilityName =
    availableFacilities.find((f) => f.id === selectedFacilityId)?.name ?? selectedFacilityId;

  // Handle file select
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

  // Submit Import
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

  // Handle Export Download
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
      alert(err instanceof Error ? err.message : 'Export failed');
    } finally {
      setExportingType(null);
    }
  };

  return (
    <div className={styles.page}>
      {/* Header */}
      <div className={styles.headerRow}>
        <div className={styles.titleArea}>
          <h1 className={styles.pageTitle}>Bulk Import & Export</h1>
          <p className={styles.pageSub}>
            Standardized CSV data ingestion and certified exports for {currentFacilityName}.
          </p>
        </div>
      </div>

      {!selectedFacilityId ? (
        <FeedbackStates.Empty message="Please select a facility from the top header to manage data imports and exports." />
      ) : (
        <div className={styles.layoutGrid}>
          {/* Section 1: CSV Import */}
          <div className={styles.sectionCard}>
            <div className={styles.sectionHeader}>
              <Upload size={18} color="var(--color-primary)" aria-hidden="true" />
              <h2 className={styles.sectionTitle}>Bulk CSV Data Import</h2>
            </div>

            {!canImport ? (
              <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)' }}>
                Your role does not have authorization to execute bulk data imports.
              </p>
            ) : (
              <form onSubmit={handleImportSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
                {importError && (
                  <div style={{ display: 'flex', gap: '8px', padding: '12px', background: 'var(--color-danger-subtle)', color: 'var(--color-danger)', borderRadius: 'var(--radius-md)', fontSize: 'var(--text-xs)' }}>
                    <AlertCircle size={16} aria-hidden="true" />
                    <span>{importError}</span>
                  </div>
                )}

                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label htmlFor="import-target-select" style={{ fontSize: 'var(--text-sm)', fontWeight: 600 }}>
                    Select Data Entity Type *
                  </label>
                  <select
                    id="import-target-select"
                    value={importTarget}
                    onChange={(e) => setImportTarget(e.target.value as 'customers' | 'grns')}
                    style={{ padding: '8px 12px', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', background: 'var(--color-surface-1)' }}
                  >
                    <option value="customers">Customers (KYC & Contact Records)</option>
                    <option value="grns">Inward Goods Receipt Notes (GRNs)</option>
                  </select>
                </div>

                <label className={styles.dropzone}>
                  <FileSpreadsheet size={32} color="var(--color-primary)" aria-hidden="true" />
                  <span className={styles.dropzoneTitle}>
                    {selectedFile ? selectedFile.name : 'Choose a .csv file or drag & drop'}
                  </span>
                  <span className={styles.dropzoneSub}>
                    {selectedFile
                      ? `${(selectedFile.size / 1024).toFixed(1)} KB`
                      : 'Max file size 2 MB. Must be standard comma-separated CSV format.'}
                  </span>
                  <input
                    type="file"
                    accept=".csv,text/csv"
                    className={styles.fileInput}
                    onChange={handleFileChange}
                  />
                </label>

                <button
                  type="submit"
                  className={styles.primaryBtn}
                  disabled={importing || !selectedFile}
                >
                  <Upload size={15} aria-hidden="true" />
                  {importing ? 'Processing Import...' : `Import ${importTarget.toUpperCase()} CSV`}
                </button>

                {importResult && (
                  <div className={styles.summaryBox}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--color-success)' }}>
                      <CheckCircle2 size={16} aria-hidden="true" />
                      Import Execution Completed
                    </div>

                    <div className={styles.summaryGrid}>
                      <div className={styles.summaryMetric}>
                        <span className={styles.metricValue}>{importResult.totalRows}</span>
                        <span className={styles.metricLabel}>Total Rows</span>
                      </div>
                      <div className={styles.summaryMetric}>
                        <span className={styles.metricValue} style={{ color: 'var(--color-success)' }}>
                          {importResult.inserted}
                        </span>
                        <span className={styles.metricLabel}>Inserted</span>
                      </div>
                      <div className={styles.summaryMetric}>
                        <span className={styles.metricValue} style={{ color: 'var(--color-primary)' }}>
                          {importResult.updated}
                        </span>
                        <span className={styles.metricLabel}>Updated</span>
                      </div>
                      <div className={styles.summaryMetric}>
                        <span className={styles.metricValue} style={{ color: 'var(--color-warning)' }}>
                          {importResult.skipped}
                        </span>
                        <span className={styles.metricLabel}>Skipped</span>
                      </div>
                    </div>

                    {importResult.errors.length > 0 && (
                      <div style={{ marginTop: '8px' }}>
                        <span style={{ fontSize: 'var(--text-xs)', fontWeight: 700, color: 'var(--color-danger)' }}>
                          Row Validation Errors ({importResult.errors.length}):
                        </span>
                        <ul className={styles.errorList}>
                          {importResult.errors.slice(0, 10).map((err, i) => (
                            <li key={i}>{err}</li>
                          ))}
                          {importResult.errors.length > 10 && (
                            <li>...and {importResult.errors.length - 10} more errors</li>
                          )}
                        </ul>
                      </div>
                    )}
                  </div>
                )}
              </form>
            )}
          </div>

          {/* Section 2: CSV Export */}
          <div className={styles.sectionCard}>
            <div className={styles.sectionHeader}>
              <Download size={18} color="var(--color-primary)" aria-hidden="true" />
              <h2 className={styles.sectionTitle}>Certified CSV Exports</h2>
            </div>

            {!canExport ? (
              <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)' }}>
                Your role does not have authorization to download certified data exports.
              </p>
            ) : (
              <div className={styles.exportList}>
                {/* 1. Customer Master Export */}
                <div className={styles.exportCard}>
                  <div className={styles.exportInfo}>
                    <span className={styles.exportTitle}>Customer Directory</span>
                    <span className={styles.exportSub}>
                      All registered customer accounts, mobile numbers, and GSTIN identifiers.
                    </span>
                  </div>
                  <button
                    type="button"
                    className={styles.exportBtn}
                    onClick={() =>
                      void handleExportDownload(
                        'customers',
                        `customers-${selectedFacilityId}.csv`,
                      )
                    }
                    disabled={exportingType === 'customers'}
                  >
                    <Download size={13} aria-hidden="true" />
                    {exportingType === 'customers' ? 'Exporting...' : 'Export CSV'}
                  </button>
                </div>

                {/* 2. Inward GRN Export */}
                <div className={styles.exportCard}>
                  <div className={styles.exportInfo}>
                    <span className={styles.exportTitle}>Inward Goods Receipt Notes</span>
                    <span className={styles.exportSub}>
                      All GRN records, bag accounting, weighbridge weights, and rent structures.
                    </span>
                  </div>
                  <button
                    type="button"
                    className={styles.exportBtn}
                    onClick={() =>
                      void handleExportDownload('grns', `grns-${selectedFacilityId}.csv`)
                    }
                    disabled={exportingType === 'grns'}
                  >
                    <Download size={13} aria-hidden="true" />
                    {exportingType === 'grns' ? 'Exporting...' : 'Export CSV'}
                  </button>
                </div>

                {/* 3. Deliveries Export */}
                <div className={styles.exportCard}>
                  <div className={styles.exportInfo}>
                    <span className={styles.exportTitle}>Outward Delivery Challans</span>
                    <span className={styles.exportSub}>
                      Issued challans, dispatched quantities, vehicles, and status events.
                    </span>
                  </div>
                  <button
                    type="button"
                    className={styles.exportBtn}
                    onClick={() =>
                      void handleExportDownload(
                        'deliveries',
                        `deliveries-${selectedFacilityId}.csv`,
                      )
                    }
                    disabled={exportingType === 'deliveries'}
                  >
                    <Download size={13} aria-hidden="true" />
                    {exportingType === 'deliveries' ? 'Exporting...' : 'Export CSV'}
                  </button>
                </div>

                {/* 4. Stock Summary Export */}
                <div className={styles.exportCard}>
                  <div className={styles.exportInfo}>
                    <span className={styles.exportTitle}>Live Stock Summary</span>
                    <span className={styles.exportSub}>
                      Aggregated stock bag quantities categorized by commodity and chamber.
                    </span>
                  </div>
                  <button
                    type="button"
                    className={styles.exportBtn}
                    onClick={() =>
                      void handleExportDownload(
                        'stock-summary',
                        `stock-summary-${selectedFacilityId}.csv`,
                      )
                    }
                    disabled={exportingType === 'stock-summary'}
                  >
                    <Download size={13} aria-hidden="true" />
                    {exportingType === 'stock-summary' ? 'Exporting...' : 'Export CSV'}
                  </button>
                </div>

                {/* 5. Inventory Ledger Export */}
                <div className={styles.exportCard}>
                  <div className={styles.exportInfo}>
                    <span className={styles.exportTitle}>Immutable Stock Ledger</span>
                    <span className={styles.exportSub}>
                      Full transaction audit trail (Put-Aways, Deliveries, Reversals).
                    </span>
                  </div>
                  <button
                    type="button"
                    className={styles.exportBtn}
                    onClick={() =>
                      void handleExportDownload(
                        'inventory-ledger',
                        `ledger-${selectedFacilityId}.csv`,
                      )
                    }
                    disabled={exportingType === 'inventory-ledger'}
                  >
                    <Download size={13} aria-hidden="true" />
                    {exportingType === 'inventory-ledger' ? 'Exporting...' : 'Export CSV'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
