'use client';

import React from 'react';
import { AlertCircle, CheckCircle2, Save } from 'lucide-react';
import { can, type Role } from '@cold-storage/contracts';
import { FeedbackStates } from '@/components/ui/FeedbackStates';
import { useAuth } from '@/context/AuthContext';
import { BackupPolicySection } from './components/BackupPolicySection';
import { BrandLogoSection } from './components/BrandLogoSection';
import { DocumentNumberingSection } from './components/DocumentNumberingSection';
import { FacilitySection } from './components/FacilitySection';
import { OrgIdentitySection } from './components/OrgIdentitySection';
import { useSettingsForm } from './hooks/useSettingsForm';
import styles from './page.module.css';

export default function SettingsPage() {
  const { user } = useAuth();
  const userRole = (user?.role ?? 'READ_ONLY') as Role;
  const isSuperAdmin = can(userRole, 'settings:manage');

  const {
    settings,
    isConfigured,
    isLoadingSettings,
    orgName,
    setOrgName,
    address,
    setAddress,
    contact,
    setContact,
    gstin,
    setGstin,
    logoAssetId,
    printFooter,
    setPrintFooter,
    timezone,
    setTimezone,
    grnPrefix,
    setGrnPrefix,
    receiptPrefix,
    setReceiptPrefix,
    challanPrefix,
    setChallanPrefix,
    rentReceiptPrefix,
    setRentReceiptPrefix,
    atlasRetentionDays,
    setAtlasRetentionDays,
    driveRetentionDays,
    setDriveRetentionDays,
    driveBackupEnabled,
    setDriveBackupEnabled,
    saving,
    saveSuccess,
    saveError,
    logoUploading,
    logoError,
    logoSuccess,
    logoDeleteArmed,
    setLogoDeleteArmed,
    handleLogoUpload,
    handleDeleteLogo,
    handleSaveSettings,
  } = useSettingsForm();

  if (!isSuperAdmin) {
    return (
      <FeedbackStates.Error
        title="Access Restricted"
        message="Only Super Administrators have authorization to view and update System Settings."
      />
    );
  }

  if (isLoadingSettings && !settings) {
    return <FeedbackStates.Loading label="Loading system settings..." />;
  }

  return (
    <div className={styles.page}>
      <div className={styles.headerRow}>
        <div className={styles.titleArea}>
          <h1 className={styles.pageTitle}>System Settings</h1>
          <p className={styles.pageSub}>
            Organization metadata, brand asset management, document templates & backup policies.
          </p>
        </div>

        <div>
          {isConfigured ? (
            <span className={styles.badgeConfigured}>
              <CheckCircle2 size={13} aria-hidden="true" />
              Configured & Active
            </span>
          ) : (
            <span className={styles.badgeConfigured} style={{ background: 'var(--color-warning-subtle)', color: 'var(--color-warning)' }}>
              <AlertCircle size={13} aria-hidden="true" />
              Configuration Pending
            </span>
          )}
        </div>
      </div>

      {!isConfigured && (
        <div className={styles.alertUnconfigured} role="alert">
          <AlertCircle size={20} style={{ flexShrink: 0, marginTop: '2px' }} aria-hidden="true" />
          <div>
            <strong>Organization Details Required:</strong>
            <p style={{ marginTop: '4px' }}>
              Official document generation (Goods Receipt Notes, Delivery Challans, and Rent Receipts)
              remains locked until organization name, registered address, and contact details are
              saved.
            </p>
          </div>
        </div>
      )}

      {saveSuccess && <div className={styles.saveSuccess}>{saveSuccess}</div>}
      {saveError && <div className={styles.saveError}>{saveError}</div>}

      <form onSubmit={handleSaveSettings} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
        <BrandLogoSection
          logoAssetId={logoAssetId}
          logoUploading={logoUploading}
          logoSuccess={logoSuccess}
          logoError={logoError}
          logoDeleteArmed={logoDeleteArmed}
          onCancelDeleteLogo={() => setLogoDeleteArmed(false)}
          onLogoUpload={handleLogoUpload}
          onDeleteLogo={handleDeleteLogo}
        />

        <OrgIdentitySection
          orgName={orgName}
          setOrgName={setOrgName}
          gstin={gstin}
          setGstin={setGstin}
          address={address}
          setAddress={setAddress}
          contact={contact}
          setContact={setContact}
          timezone={timezone}
          setTimezone={setTimezone}
          printFooter={printFooter}
          setPrintFooter={setPrintFooter}
        />

        <DocumentNumberingSection
          grnPrefix={grnPrefix}
          setGrnPrefix={setGrnPrefix}
          receiptPrefix={receiptPrefix}
          setReceiptPrefix={setReceiptPrefix}
          challanPrefix={challanPrefix}
          setChallanPrefix={setChallanPrefix}
          rentReceiptPrefix={rentReceiptPrefix}
          setRentReceiptPrefix={setRentReceiptPrefix}
        />

        <FacilitySection />

        <BackupPolicySection
          atlasRetentionDays={atlasRetentionDays}
          setAtlasRetentionDays={setAtlasRetentionDays}
          driveRetentionDays={driveRetentionDays}
          setDriveRetentionDays={setDriveRetentionDays}
          driveBackupEnabled={driveBackupEnabled}
          setDriveBackupEnabled={setDriveBackupEnabled}
        />

        <div className={styles.saveFooter}>
          <button
            id="save-settings-btn"
            type="submit"
            className={styles.saveBtn}
            disabled={saving}
          >
            <Save size={16} aria-hidden="true" />
            {saving ? 'Saving Settings...' : 'Save System Settings'}
          </button>
        </div>
      </form>
    </div>
  );
}
