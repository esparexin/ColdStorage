'use client';

import { useEffect, useState } from 'react';
import type { SystemSettings } from '@cold-storage/contracts';
import { useSettings } from '@/context/SettingsContext';
import { requestWithAuth } from '@/lib/api-client';

export function useSettingsForm() {
  const { settings, isConfigured, isLoadingSettings, refreshSettings } = useSettings();

  const [orgName, setOrgName] = useState('');
  const [address, setAddress] = useState('');
  const [contact, setContact] = useState('');
  const [gstin, setGstin] = useState('');
  const [logoAssetId, setLogoAssetId] = useState<string | null>(null);
  const [printFooter, setPrintFooter] = useState('');
  const [timezone, setTimezone] = useState('Asia/Kolkata');

  const [grnPrefix, setGrnPrefix] = useState('GRN');
  const [receiptPrefix, setReceiptPrefix] = useState('RCPT');
  const [challanPrefix, setChallanPrefix] = useState('CHL');
  const [rentReceiptPrefix, setRentReceiptPrefix] = useState('RRCPT');

  const [atlasRetentionDays, setAtlasRetentionDays] = useState(7);
  const [driveRetentionDays, setDriveRetentionDays] = useState(30);
  const [driveBackupEnabled, setDriveBackupEnabled] = useState(true);

  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [logoUploading, setLogoUploading] = useState(false);
  const [logoError, setLogoError] = useState<string | null>(null);
  const [logoDeleteArmed, setLogoDeleteArmed] = useState(false);
  const [logoSuccess, setLogoSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (settings) {
      setOrgName(settings.orgName ?? '');
      setAddress(settings.address ?? '');
      setContact(settings.contact ?? '');
      setGstin(settings.gstin ?? '');
      setLogoAssetId(settings.logoAssetId ?? null);
      setPrintFooter(settings.printFooter ?? '');
      setTimezone(settings.timezone ?? 'Asia/Kolkata');

      if (settings.documentNumbering) {
        setGrnPrefix(settings.documentNumbering.grnPrefix ?? 'GRN');
        setReceiptPrefix(settings.documentNumbering.receiptPrefix ?? 'RCPT');
        setChallanPrefix(settings.documentNumbering.challanPrefix ?? 'CHL');
        setRentReceiptPrefix(settings.documentNumbering.rentReceiptPrefix ?? 'RRCPT');
      }

      if (settings.backupPolicy) {
        setAtlasRetentionDays(settings.backupPolicy.atlasRetentionDays ?? 7);
        setDriveRetentionDays(settings.backupPolicy.driveRetentionDays ?? 30);
        setDriveBackupEnabled(settings.backupPolicy.driveBackupEnabled ?? true);
      }
    }
  }, [settings]);

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 1024 * 1024) {
      setLogoError('Logo file size exceeds the 1 MB limit.');
      return;
    }

    const allowed = ['image/png', 'image/jpeg', 'image/webp'];
    if (!allowed.includes(file.type)) {
      setLogoError('Only PNG, JPEG, or WebP images are allowed.');
      return;
    }

    setLogoUploading(true);
    setLogoError(null);
    setLogoSuccess(null);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await requestWithAuth('/api/settings/logo', {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const err = (await res.json()) as { error?: string };
        throw new Error(err.error ?? `Upload failed with HTTP ${res.status}`);
      }

      const data = (await res.json()) as { asset: { id: string } };
      setLogoAssetId(data.asset.id);
      setLogoSuccess('Brand logo uploaded and bound to organization settings.');
      await refreshSettings();
    } catch (err: unknown) {
      setLogoError(err instanceof Error ? err.message : 'Logo upload failed');
    } finally {
      setLogoUploading(false);
      e.target.value = '';
    }
  };

  const handleDeleteLogo = async () => {
    // Destructive confirmation is handled in the UI rather than a blocking browser dialog,
    // so it can be styled, announced to assistive tech, and composed with the section's
    // existing error/success messaging.
    if (!logoDeleteArmed) {
      setLogoDeleteArmed(true);
      return;
    }

    setLogoDeleteArmed(false);
    setLogoUploading(true);
    setLogoError(null);
    setLogoSuccess(null);

    try {
      const res = await requestWithAuth('/api/settings/logo', {
        method: 'DELETE',
      });

      if (!res.ok) {
        const err = (await res.json()) as { error?: string };
        throw new Error(err.error ?? `Deletion failed with HTTP ${res.status}`);
      }

      setLogoAssetId(null);
      setLogoSuccess('Logo removed successfully.');
      await refreshSettings();
    } catch (err: unknown) {
      setLogoError(err instanceof Error ? err.message : 'Failed to delete logo');
    } finally {
      setLogoUploading(false);
    }
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!orgName.trim() || !address.trim() || !contact.trim()) {
      setSaveError('Organization Name, Registered Address, and Contact Details are required.');
      return;
    }

    if (gstin.trim()) {
      const gstinRegex = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
      if (!gstinRegex.test(gstin.trim().toUpperCase())) {
        setSaveError('Invalid Indian GSTIN format (e.g. 09ABCDE1234F1Z5)');
        return;
      }
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
      documentNumbering: {
        mode: 'FY_SEQUENTIAL',
        grnPrefix: grnPrefix.trim() || 'GRN',
        receiptPrefix: receiptPrefix.trim() || 'RCPT',
        challanPrefix: challanPrefix.trim() || 'CHL',
        rentReceiptPrefix: rentReceiptPrefix.trim() || 'RRCPT',
      },
      backupPolicy: {
        atlasRetentionDays,
        driveRetentionDays,
        driveBackupEnabled,
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
  };
}
