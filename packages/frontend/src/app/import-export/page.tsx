'use client';

import React from 'react';
import { can, type Role } from '@cold-storage/contracts';
import { FeedbackStates } from '@/components/ui/FeedbackStates';
import { useAuth } from '@/context/AuthContext';
import { useFacility } from '@/context/FacilityContext';
import { ExportPanel } from './components/ExportPanel';
import { ImportPanel } from './components/ImportPanel';
import { useImportExport } from './hooks/useImportExport';
import styles from './page.module.css';

export default function ImportExportPage() {
  const { user } = useAuth();
  const { selectedFacilityId, availableFacilities } = useFacility();

  const userRole = (user?.role ?? 'READ_ONLY') as Role;
  const canImport = can(userRole, 'import:execute');
  const canExport = can(userRole, 'export:execute');

  const {
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
  } = useImportExport(selectedFacilityId);

  const currentFacilityName =
    availableFacilities.find((f) => f.id === selectedFacilityId)?.name ?? selectedFacilityId;

  return (
    <div className={styles.page}>
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
            onExport={handleExportDownload}
          />
        </div>
      )}
    </div>
  );
}
