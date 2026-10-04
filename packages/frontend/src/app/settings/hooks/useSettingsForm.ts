'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { SystemSettings } from '@cold-storage/contracts';
import { useSettings } from '@/context/SettingsContext';
import { requestWithAuth } from '@/lib/api-client';
import { useLogoUpload } from './useLogoUpload';

/** Server state that the form mirrors. Kept as a primitive so the hook has a single comparison source. */
interface FormSnapshot {
  orgName: string;
  address: string;
  contact: string;
  gstin: string;
  logoAssetId: string | null;
  printFooter: string;
  timezone: string;
  retentionDays: number;
  backupEnabled: boolean;
}

function toSnapshot(settings: SystemSettings): FormSnapshot {
  return {
    orgName: settings.orgName ?? '',
    address: settings.address ?? '',
    contact: settings.contact ?? '',
    gstin: settings.gstin ?? '',
    logoAssetId: settings.logoAssetId ?? null,
    printFooter: settings.printFooter ?? '',
    timezone: settings.timezone ?? 'Asia/Kolkata',
    retentionDays: settings.backupPolicy?.retentionDays ?? 30,
    backupEnabled: settings.backupPolicy?.backupEnabled ?? true,
  };
}

const GSTIN_PATTERN = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;

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

  // Adopt server state, but never discard edits the operator has not saved yet. Previously any
  // settings refetch (a logo upload, a save in another tab) overwrote every field, silently
  // losing in-progress work elsewhere on the page.
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

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!orgName.trim() || !address.trim() || !contact.trim()) {
      setSaveError('Organization Name, Registered Address, and Contact Details are required.');
      return;
    }

    if (gstin.trim() && !GSTIN_PATTERN.test(gstin.trim().toUpperCase())) {
      setSaveError('Invalid Indian GSTIN format (e.g. 09ABCDE1234F1Z5)');
      return;
    }

    setSaving(true);
    setSaveError(null);
    setSaveSuccess(null);

    const payload: SystemSettings = {
      orgName: orgName.trim(),
      address: address.trim(),
      contact: contact.trim(),
      gstin: gstin.trim() ? gstin.trim().toUpperCase() : undefined,
      logoAssetId: logoAssetId ?? undefined,
      printFooter: printFooter.trim(),
      timezone: timezone.trim() || 'Asia/Kolkata',
      backupPolicy: {
        retentionDays,
        backupEnabled,
      },
    };

    try {
      const res = await requestWithAuth('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = (await res.json()) as { error?: string };
        throw new Error(err.error ?? `Save failed with HTTP ${res.status}`);
      }

      // Adopt what was just written before refetching, so the form is clean and the incoming
      // server state cannot be mistaken for an unsaved edit.
      hydrate(currentSnapshot);
      setSaveSuccess('System settings and organization details updated successfully.');
      await refreshSettings();
    } catch (err: unknown) {
      setSaveError(err instanceof Error ? err.message : 'Failed to update settings');
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
  };
}