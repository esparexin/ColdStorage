'use client';

import React from 'react';
import { AlertCircle, CheckCircle2, FileSpreadsheet, Upload } from 'lucide-react';
import { Button, Card, Select, StatCard, StatGrid } from '@/components/ui';
import type { ImportSummaryResult } from '../types';
import styles from '../page.module.css';

interface ImportPanelProps {
  canImport: boolean;
  importTarget: 'customers' | 'grns';
  setImportTarget: (val: 'customers' | 'grns') => void;
  selectedFile: File | null;
  importing: boolean;
  importResult: ImportSummaryResult | null;
  importError: string | null;
  onFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onSubmit: (e: React.FormEvent) => void;
}

export function ImportPanel({
  canImport,
  importTarget,
  setImportTarget,
  selectedFile,
  importing,
  importResult,
  importError,
  onFileChange,
  onSubmit,
}: ImportPanelProps) {
  // The server reports per-row outcomes; flatten the rejected rows into the
  // single validation-error list the operator reads.
  const rejectedRows = React.useMemo(
    () =>
      (importResult?.results ?? [])
        .filter((r) => r.status === 'rejected')
        .map((r) => `Row ${r.row}: ${(r.errors ?? ['Import failed']).join('; ')}`),
    [importResult],
  );

  return (
    <Card>
      <div className={styles.sectionHeader}>
        <h2 className={styles.sectionTitle}>Bulk CSV Data Import</h2>
      </div>

      {!canImport ? (
        <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)' }}>
          Your role does not have authorization to execute bulk data imports.
        </p>
      ) : (
        <form onSubmit={onSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          {importError && (
            <div style={{ display: 'flex', gap: 'var(--space-2)', padding: 'var(--space-2)', background: 'var(--color-danger-subtle)', color: 'var(--color-danger)', borderRadius: 'var(--radius-md)', fontSize: 'var(--text-xs)' }}>
              <AlertCircle size={16} aria-hidden="true" />
              <span>{importError}</span>
            </div>
          )}

          <Select
              id="import-target-select"
              label="Select Data Entity Type"
              required
              value={importTarget}
              onChange={(e) => setImportTarget(e.target.value as 'customers' | 'grns')}
            >
              <option value="customers">Customers (KYC & Contact Records)</option>
              <option value="grns">Acknowledgement of Goods (GRNs)</option>
            </Select>

          <label className={styles.dropzone}>
            <FileSpreadsheet size={24} color="var(--color-primary)" aria-hidden="true" />
            <span className={styles.dropzoneTitle}>
              {selectedFile ? selectedFile.name : 'Choose a .csv file or drag & drop'}
            </span>
            <span className={styles.dropzoneSub}>
              {selectedFile
                ? `${(selectedFile.size / 1024).toFixed(1)} KB`
                : 'Max file size 2 MB. Comma-separated CSV.'}
            </span>
            <input
              type="file"
              accept=".csv,text/csv"
              className={styles.fileInput}
              onChange={onFileChange}
              aria-label="Upload CSV file"
            />
          </label>

          <Button
            type="submit"
            variant="primary"
            disabled={importing || !selectedFile}
            isLoading={importing}
            leftIcon={<Upload size={15} aria-hidden="true" />}
          >
            {importing ? 'Processing Import...' : `Import ${importTarget.toUpperCase()} CSV`}
          </Button>

          {importResult && (
            <div className={styles.summaryBox}>
              <p className={styles.summaryStatus}>
                <CheckCircle2 size={16} aria-hidden="true" />
                Import Execution Completed
              </p>

              <StatGrid label="Import result summary">
                <StatCard label="Rows Processed" value={importResult.totalRows} />
                <StatCard
                  label="Committed"
                  value={importResult.committed}
                  accent="success"
                />
                <StatCard
                  label="Rejected"
                  value={importResult.rejected}
                  accent={importResult.rejected > 0 ? 'danger' : undefined}
                />
              </StatGrid>

              {rejectedRows.length > 0 && (
                <div>
                  <span className={styles.errorHeading}>
                    Row Validation Errors ({rejectedRows.length})
                  </span>
                  <ul className={styles.errorList}>
                    {rejectedRows.slice(0, 10).map((err, i) => (
                      <li key={i}>{err}</li>
                    ))}
                    {rejectedRows.length > 10 && (
                      <li>...and {rejectedRows.length - 10} more errors</li>
                    )}
                  </ul>
                </div>
              )}
            </div>
          )}
        </form>
      )}
    </Card>
  );
}
