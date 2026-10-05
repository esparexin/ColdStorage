'use client';

import React, { useCallback } from 'react';
import { AlertCircle, CheckCircle2 } from 'lucide-react';
import { can, type Role } from '@cold-storage/contracts';
import { Banner, Button, ConfirmDialog, FeedbackStates } from '@/components/ui';
import { ACCESS_MESSAGES, ERROR_TITLES, LOADING_LABELS } from '@/components/ui/stateCopy';
import { useAuth } from '@/context/AuthContext';
import { useUnsavedChanges } from '@/hooks/useUnsavedChanges';
import { useRouter } from 'next/navigation';
import { BackupPolicySection } from './components/BackupPolicySection';
import { BrandLogoSection } from './components/BrandLogoSection';
import { ConnectivitySection } from './components/ConnectivitySection';
import { FacilitySection } from './components/FacilitySection';
import { OrgIdentitySection } from './components/OrgIdentitySection';
import { useSettingsForm } from './hooks/useSettingsForm';
import styles from './page.module.css';

export default function SettingsPage() {
  const router = useRouter();
  const { user } = useAuth();
  const userRole = (user?.role ?? 'READ_ONLY') as Role;
  const canManageSettings = can(userRole, 'settings:manage');

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
    retentionDays,
    setRetentionDays,
    backupEnabled,
    setBackupEnabled,
    isDirty,
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

  const { attemptExit, isConfirmOpen, confirmExit, cancelExit } = useUnsavedChanges(isDirty);
  const handleLeavePage = useCallback(() => router.push('/'), [router]);

  if (!canManageSettings) {
    return (
      <FeedbackStates.Error
        title={ERROR_TITLES.accessRestricted}
        message={ACCESS_MESSAGES.settings}
      />
    );
  }

  if (isLoadingSettings && !settings) {
    return <FeedbackStates.Loading label={LOADING_LABELS.settings} />;
  }

  return (
    <div className={styles.page}>
      <div className={styles.headerRow}>
        <div className={styles.titleArea}>
          <h1 className={styles.pageTitle}>System Settings</h1>
        </div>

        <div>
          {isConfigured ? (
            <span className={styles.badgeConfigured}>
              <CheckCircle2 size={13} aria-hidden="true" />
              Configured & Active
            </span>
          ) : (
            <span
              className={styles.badgeConfigured}
              style={{ background: 'var(--color-warning-subtle)', color: 'var(--color-warning)' }}
            >
              <AlertCircle size={13} aria-hidden="true" />
              Configuration Pending
            </span>
          )}
        </div>
      </div>

      {!isConfigured && (
        <Banner
          variant="info"
          id="settings-unconfigured"
          message="Organization Details Required: Official document generation (Goods Receipt Notes, Delivery Challans, and Rent Receipts) remains locked until organization name, registered address, and contact details are saved."
        />
      )}

      {saveSuccess && <Banner variant="success" message={saveSuccess} />}
      {saveError && <Banner message={saveError} id="settings-save-error" />}

      <form onSubmit={handleSaveSettings} className={styles.form}>
        {/*
          Native disclosure keeps each area collapsible without introducing a new design-system
          primitive. Organization details stay open because they gate document generation; the
          rest start collapsed so the page fits without a long scroll.
        */}
        <details className={styles.disclosure} open>
          <summary className={styles.disclosureSummary}>
            Organization Identity &amp; Operating Details
          </summary>
          <div className={styles.disclosureBody}>
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
          </div>
        </details>

        <details className={styles.disclosure}>
          <summary className={styles.disclosureSummary}>Brand Logo</summary>
          <div className={styles.disclosureBody}>
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
          </div>
        </details>

        <details className={styles.disclosure}>
          <summary className={styles.disclosureSummary}>Database Backup</summary>
          <div className={styles.disclosureBody}>
            <BackupPolicySection
              retentionDays={retentionDays}
              setRetentionDays={setRetentionDays}
              backupEnabled={backupEnabled}
              setBackupEnabled={setBackupEnabled}
            />
          </div>
        </details>

        <div className={styles.saveFooter}>
          {isDirty && (
            <>
              <span className={styles.unsavedHint}>Unsaved changes</span>
              <Button
                id="discard-settings-btn"
                variant="ghost"
                size="sm"
                onClick={() => attemptExit(handleLeavePage)}
              >
                Discard and leave
              </Button>
            </>
          )}
          <Button
            id="save-settings-btn"
            type="submit"
            variant="primary"
            size="sm"
            disabled={saving}
            isLoading={saving}
          >
            {saving ? LOADING_LABELS.saving : 'Save Settings'}
          </Button>
        </div>
      </form>

      {/*
        Facilities are managed through their own modal form and persist immediately, so this
        section is deliberately rendered OUTSIDE the system-settings form above. Nesting it
        inside would submit the settings form on every facility save, writing unrelated
        organization fields and reporting a misleading save result.
      */}
      <FacilitySection />

      <ConnectivitySection />

      <ConfirmDialog
        isOpen={isConfirmOpen}
        title="Unsaved Changes"
        message="Your changes to organization details have not been saved. Are you sure you want to leave this page?"
        cancelLabel="Stay"
        confirmLabel="Leave"
        onCancel={cancelExit}
        onConfirm={confirmExit}
      />
    </div>
  );
}
