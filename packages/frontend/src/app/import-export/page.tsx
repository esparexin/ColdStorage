'use client';

import React from 'react';
import { } from '@cold-storage/contracts';
import { FeedbackStates } from '@/components/ui/FeedbackStates';
import { EMPTY_MESSAGES } from '@/components/ui/stateCopy';
import { usePermissions } from '@/hooks/usePermissions';
import { useFacility } from '@/context/FacilityContext';
import { ExportPanel } from './components/ExportPanel';
import { ImportPanel } from './components/ImportPanel';
import { useImportExport } from './hooks/useImportExport';
import styles from './page.module.css';

export default function ImportExportPage() {
  const { hasPermission } = usePermissions();
  const { selectedFacilityId } = useFacility();
  const canImport = hasPermission('import:execute');
  const canExport = hasPermission('export:execute');

  const {
    importTarget,
    setImportTarget,
    selectedFile,
    importing,
    importResult,
    importError,
    exportingType,
    exportError,
    handleFileChange,
    handleImportSubmit,
    handleExportDownload,
  } = useImportExport(selectedFacilityId);

  return (
    <div className={styles.page}>
      <div className={styles.headerRow}>
        <div className={styles.titleArea}>
          <h1 className={styles.pageTitle}>Bulk Import & Export</h1>
        </div>
      </div>

      {!selectedFacilityId ? (
        <FeedbackStates.Empty message={EMPTY_MESSAGES.noFacilityImportExport} />
      ) : (
        <div className={styles.layoutGrid}>
          <ImportPanel
            canImport={canImport}
            importTarget={importTarget}
            setImportTarget={setImportTarget}
            selectedFile={selectedFile}
            importing={importing}
            importResult={importResult}
            importError={importError}
            onFileChange={handleFileChange}
            onSubmit={handleImportSubmit}
          />

          <ExportPanel
            canExport={canExport}
            selectedFacilityId={selectedFacilityId}
            exportingType={exportingType}
            exportError={exportError}
            onExport={handleExportDownload}
          />
        </div>
      )}
    </div>
  );
}
