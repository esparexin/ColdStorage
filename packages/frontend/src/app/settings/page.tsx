'use client';

import React, { Suspense, useCallback, useState } from 'react';
import { can, type Role } from '@cold-storage/contracts';
import { ConfirmDialog, FeedbackStates } from '@/components/ui';
import { ACCESS_MESSAGES, ERROR_TITLES, LOADING_LABELS } from '@/components/ui/stateCopy';
import { useAuth } from '@/context/AuthContext';
import { useUnsavedChanges } from '@/hooks/useUnsavedChanges';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { BackupTab } from './components/BackupTab';
import { BrandLogoSection } from './components/BrandLogoSection';
import { ConnectivitySection } from './components/ConnectivitySection';
import { FacilitySection } from './components/FacilitySection';
import { OrganizationTab } from './components/OrganizationTab';
import { PricingExplainerSection } from './components/PricingExplainerSection';
import { SettingsHeader } from './components/SettingsHeader';
import { SettingsTabs, isTabId, type SettingsTabId } from './components/SettingsTabs';
import { useSettingsForm } from './hooks/useSettingsForm';
import styles from './page.module.css';

function SettingsPageInner() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const userRole = (user?.role ?? 'READ_ONLY') as Role;
  const canManageSettings = can(userRole, 'settings:manage');

  const rawTab = searchParams.get('tab');
  const activeTab: SettingsTabId = isTabId(rawTab) ? rawTab : 'organization';

  const form = useSettingsForm();

  const [isEditingOrg, setIsEditingOrg] = useState(false);
  const [isEditingBackup, setIsEditingBackup] = useState(false);
  const [pendingTab, setPendingTab] = useState<SettingsTabId | null>(null);

  const hasUnsavedEdits =
    (isEditingOrg && form.isOrgDirty) || (isEditingBackup && form.isBackupDirty);

  const { attemptExit, isConfirmOpen, confirmExit, cancelExit } = useUnsavedChanges(hasUnsavedEdits);

  const navigateToTab = useCallback(
    (tab: SettingsTabId) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set('tab', tab);
      router.push(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  const discardEditsAndClose = useCallback(() => {
    form.revertOrgChanges();
    form.revertBackupChanges();
    setIsEditingOrg(false);
    setIsEditingBackup(false);
  }, [form]);

  const handleRequestTab = useCallback(
    (tab: SettingsTabId) => {
      if (tab === activeTab) return;
      if (!hasUnsavedEdits) {
        navigateToTab(tab);
        return;
      }
      setPendingTab(tab);
      attemptExit(() => {});
    },
    [activeTab, attemptExit, hasUnsavedEdits, navigateToTab],
  );

  const handleConfirmLeave = useCallback(() => {
    confirmExit();
    discardEditsAndClose();
    if (pendingTab) {
      navigateToTab(pendingTab);
      setPendingTab(null);
    }
  }, [confirmExit, discardEditsAndClose, navigateToTab, pendingTab]);

  const handleCancelLeave = useCallback(() => {
    cancelExit();
    setPendingTab(null);
  }, [cancelExit]);

  const handleSaveOrg = useCallback(async () => {
    const ok = await form.handleSaveOrganization();
    if (ok) setIsEditingOrg(false);
  }, [form]);

  const handleSaveBackup = useCallback(async () => {
    const ok = await form.handleSaveBackupPolicy();
    if (ok) setIsEditingBackup(false);
  }, [form]);

  if (!canManageSettings) {
    return (
      <FeedbackStates.Error
        title={ERROR_TITLES.accessRestricted}
        message={ACCESS_MESSAGES.settings}
      />
    );
  }

  if (form.isLoadingSettings && !form.settings) {
    return <FeedbackStates.Loading label={LOADING_LABELS.settings} />;
  }

  return (
    <div className={styles.page}>
      <SettingsHeader isConfigured={form.isConfigured} />

      <SettingsTabs activeTab={activeTab} onRequestTab={handleRequestTab} />

      {activeTab === 'organization' && (
        <OrganizationTab
          orgName={form.orgName}
          setOrgName={form.setOrgName}
          address={form.address}
          setAddress={form.setAddress}
          contact={form.contact}
          setContact={form.setContact}
          gstin={form.gstin}
          setGstin={form.setGstin}
          timezone={form.timezone}
          setTimezone={form.setTimezone}
          printFooter={form.printFooter}
          setPrintFooter={form.setPrintFooter}
          isEditing={isEditingOrg}
          isDirty={form.isOrgDirty}
          saving={form.saving}
          saveSuccess={form.saveSuccess}
          saveError={form.saveError}
          onEdit={() => setIsEditingOrg(true)}
          onCancel={() => {
            form.revertOrgChanges();
            setIsEditingOrg(false);
          }}
          onSave={() => void handleSaveOrg()}
        />
      )}

      {activeTab === 'logo' && (
        <section
          id="settings-panel-logo"
          role="tabpanel"
          aria-labelledby="settings-tab-logo"
          className={styles.tabPanel}
        >
          <div className={styles.panelHeader}>
            <div>
              <h2 className={styles.panelTitle}>Brand Logo</h2>
              <p className={styles.panelDescription}>
                Applied immediately to printed documents. No Edit step needed.
              </p>
            </div>
          </div>
          <BrandLogoSection
            logoAssetId={form.logoAssetId}
            logoUploading={form.logoUploading}
            logoSuccess={form.logoSuccess}
            logoError={form.logoError}
            logoDeleteArmed={form.logoDeleteArmed}
            onCancelDeleteLogo={() => form.setLogoDeleteArmed(false)}
            onLogoUpload={form.handleLogoUpload}
            onDeleteLogo={form.handleDeleteLogo}
          />
        </section>
      )}

      {activeTab === 'backup' && (
        <BackupTab
          retentionDays={form.retentionDays}
          setRetentionDays={form.setRetentionDays}
          backupEnabled={form.backupEnabled}
          setBackupEnabled={form.setBackupEnabled}
          isEditing={isEditingBackup}
          isDirty={form.isBackupDirty}
          saving={form.saving}
          saveSuccess={form.saveSuccess}
          saveError={form.saveError}
          onEdit={() => setIsEditingBackup(true)}
          onCancel={() => {
            form.revertBackupChanges();
            setIsEditingBackup(false);
          }}
          onSave={() => void handleSaveBackup()}
        />
      )}

      {activeTab === 'pricing' && (
        <div id="settings-panel-pricing" role="tabpanel" aria-labelledby="settings-tab-pricing">
          <div className={styles.tabPanel}>
            <PricingExplainerSection />
          </div>
        </div>
      )}

      {activeTab === 'facilities' && (
        <div id="settings-panel-facilities" role="tabpanel" aria-labelledby="settings-tab-facilities">
          <FacilitySection />
        </div>
      )}

      {activeTab === 'connectivity' && (
        <div
          id="settings-panel-connectivity"
          role="tabpanel"
          aria-labelledby="settings-tab-connectivity"
        >
          <ConnectivitySection />
        </div>
      )}

      <ConfirmDialog
        isOpen={isConfirmOpen}
        title="Unsaved Changes"
        message="Your edits have not been saved. Discard them and switch sections?"
        cancelLabel="Stay"
        confirmLabel="Discard and switch"
        onCancel={handleCancelLeave}
        onConfirm={handleConfirmLeave}
      />
    </div>
  );
}

export default function SettingsPage() {
  return (
    <Suspense fallback={<FeedbackStates.Loading label={LOADING_LABELS.settings} />}>
      <SettingsPageInner />
    </Suspense>
  );
}
