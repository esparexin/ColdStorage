'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { SystemSettings } from '@cold-storage/contracts';
import { useSettings } from '@/context/SettingsContext';
import { requestWithAuth } from '@/lib/api-client';
import { useLogoUpload } from './useLogoUpload';
import {
  buildSettingsPayload,
  toSnapshot,
  validateBackupFields,
  validateOrgFields,
  type FormSnapshot,
} from './settingsFormUtils';

export function useSettingsForm() {
  const { settings, isConfigured, isLoadingSettings, refreshSettings } = useSettings();

  const [orgName, setOrgName] = useState('');
  const [address, setAddress] = useState('');
  const [contact, setContact] = useState('');
  const [gstin, setGstin] = useState('');
  const [logoAssetId, setLogoAssetId] = useState<string | null>(null);
  const [printFooter, setPrintFooter] = useState('');
  const [timezone, setTimezone] = useState('Asia/Kolkata');
  const [retentionDays, setRetentionDays] = useState(30);
  const [backupEnabled, setBackupEnabled] = useState(true);

  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Snapshot of the server state the form currently reflects. In-progress edits are compared
  // against it to decide whether an incoming server update may overwrite the form.
  const baselineRef = useRef<FormSnapshot | null>(null);

  const hydrate = useCallback((next: FormSnapshot) => {
    setOrgName(next.orgName);
    setAddress(next.address);
    setContact(next.contact);
    setGstin(next.gstin);
    setLogoAssetId(next.logoAssetId);
    setPrintFooter(next.printFooter);
    setTimezone(next.timezone);
    setRetentionDays(next.retentionDays);
    setBackupEnabled(next.backupEnabled);
    baselineRef.current = next;
  }, []);

  /** Keeps the dirty-state baseline aligned when the logo asset changes outside the text fields. */
  const syncLogoAssetId = useCallback((assetId: string | null) => {
    setLogoAssetId(assetId);
    if (baselineRef.current) {
      baselineRef.current = { ...baselineRef.current, logoAssetId: assetId };
    }
  }, []);

  const {
    logoUploading,
    logoError,
    logoSuccess,
    logoDeleteArmed,
    setLogoDeleteArmed,
    handleLogoUpload,
    handleDeleteLogo,
  } = useLogoUpload(syncLogoAssetId);

  const currentSnapshot = useMemo<FormSnapshot>(
    () => ({
      orgName,
      address,
      contact,
      gstin,
      logoAssetId,
      printFooter,
      timezone,
      retentionDays,
      backupEnabled,
    }),
    [orgName, address, contact, gstin, logoAssetId, printFooter, timezone, retentionDays, backupEnabled],
  );

  const isDirty =
    baselineRef.current !== null && JSON.stringify(currentSnapshot) !== JSON.stringify(baselineRef.current);

  /** Per-section dirty tracking: org and backup are edited and saved independently. */
  const isOrgDirty =
    baselineRef.current !== null &&
    (baselineRef.current.orgName !== orgName ||
      baselineRef.current.address !== address ||
      baselineRef.current.contact !== contact ||
      baselineRef.current.gstin !== gstin ||
      baselineRef.current.printFooter !== printFooter ||
      baselineRef.current.timezone !== timezone);

  const isBackupDirty =
    baselineRef.current !== null &&
    (baselineRef.current.retentionDays !== retentionDays ||
      baselineRef.current.backupEnabled !== backupEnabled);

  /** Discard in-progress Organization edits and restore the last saved server values. */
  const revertOrgChanges = useCallback(() => {
    if (!baselineRef.current) return;
    const base = baselineRef.current;
    setOrgName(base.orgName);
    setAddress(base.address);
    setContact(base.contact);
    setGstin(base.gstin);
    setPrintFooter(base.printFooter);
    setTimezone(base.timezone);
    setSaveError(null);
  }, []);

  /** Discard in-progress Backup Policy edits and restore the last saved server values. */
  const revertBackupChanges = useCallback(() => {
    if (!baselineRef.current) return;
    const base = baselineRef.current;
    setRetentionDays(base.retentionDays);
    setBackupEnabled(base.backupEnabled);
    setSaveError(null);
  }, []);

  // Adopt server state, but never discard edits the operator has not saved yet.
  useEffect(() => {
    if (!settings) return;
    const next = toSnapshot(settings);
    if (baselineRef.current === null) {
      hydrate(next);
      return;
    }
    if (!isDirty) {
      hydrate(next);
    }
  }, [settings, isDirty, hydrate]);

  const persistSettings = useCallback(
    async (payload: SystemSettings) => {
      const res = await requestWithAuth('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = (await res.json()) as { error?: string };
        throw new Error(err.error ?? `Save failed with HTTP ${res.status}`);
      }

      // Adopt what was just written before refetching, so the form is clean.
      hydrate(currentSnapshot);
      await refreshSettings();
    },
    [currentSnapshot, hydrate, refreshSettings],
  );

  const handleSaveOrganization = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const error = validateOrgFields({ orgName, address, contact, gstin, printFooter, timezone });
    if (error) {
      setSaveError(error);
      return false;
    }

    setSaving(true);
    setSaveError(null);
    setSaveSuccess(null);

    try {
      await persistSettings(buildSettingsPayload(currentSnapshot));
      setSaveSuccess('Organization details updated successfully.');
      return true;
    } catch (err: unknown) {
      setSaveError(err instanceof Error ? err.message : 'Failed to update organization details');
      return false;
    } finally {
      setSaving(false);
    }
  };

  const handleSaveBackupPolicy = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const error = validateBackupFields(retentionDays);
    if (error) {
      setSaveError(error);
      return false;
    }

    setSaving(true);
    setSaveError(null);
    setSaveSuccess(null);

    try {
      await persistSettings(buildSettingsPayload(currentSnapshot));
      setSaveSuccess('Backup policy updated successfully.');
      return true;
    } catch (err: unknown) {
      setSaveError(err instanceof Error ? err.message : 'Failed to update backup policy');
      return false;
    } finally {
      setSaving(false);
    }
  };

  return {
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
    isOrgDirty,
    isBackupDirty,
    revertOrgChanges,
    revertBackupChanges,
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
    handleSaveOrganization,
    handleSaveBackupPolicy,
  };
}
