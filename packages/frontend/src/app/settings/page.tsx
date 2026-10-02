'use client';

import React, { useEffect, useState } from 'react';
import {
  AlertCircle,
  Building,
  CheckCircle2,
  Cloud,
  FileText,
  Image as ImageIcon,
  Save,
  Trash2,
  UploadCloud,
} from 'lucide-react';
import { can, type Role, type SystemSettings } from '@cold-storage/contracts';
import { FeedbackStates } from '@/components/ui/FeedbackStates';
import { useAuth } from '@/context/AuthContext';
import { useSettings } from '@/context/SettingsContext';
import { requestWithAuth } from '@/lib/api-client';
import styles from './page.module.css';

export default function SettingsPage() {
  const { user } = useAuth();
  const { settings, isConfigured, isLoadingSettings, refreshSettings } = useSettings();

  const userRole = (user?.role ?? 'READ_ONLY') as Role;
  const isSuperAdmin = can(userRole, 'settings:manage');

  // Form States
  const [orgName, setOrgName] = useState('');
  const [address, setAddress] = useState('');
  const [contact, setContact] = useState('');
  const [gstin, setGstin] = useState('');
  const [logoAssetId, setLogoAssetId] = useState<string | null>(null);
  const [printFooter, setPrintFooter] = useState('');
  const [timezone, setTimezone] = useState('Asia/Kolkata');

  // Document Numbering
  const [grnPrefix, setGrnPrefix] = useState('GRN');
  const [receiptPrefix, setReceiptPrefix] = useState('RCPT');
  const [challanPrefix, setChallanPrefix] = useState('CHL');
  const [rentReceiptPrefix, setRentReceiptPrefix] = useState('RRCPT');

  // Backup Policy
  const [atlasRetentionDays, setAtlasRetentionDays] = useState(7);
  const [driveRetentionDays, setDriveRetentionDays] = useState(30);
  const [driveBackupEnabled, setDriveBackupEnabled] = useState(true);

  // Status & Notifications
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Logo Upload State
  const [logoUploading, setLogoUploading] = useState(false);
  const [logoError, setLogoError] = useState<string | null>(null);
  const [logoSuccess, setLogoSuccess] = useState<string | null>(null);

  // Populate form from existing settings
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

  // Handle Logo Upload
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
      // Reset input value so same file can be re-selected if needed
      e.target.value = '';
    }
  };

  // Handle Logo Deletion
  const handleDeleteLogo = async () => {
    if (!confirm('Are you sure you want to remove the organization logo?')) return;

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

  // Handle Save Settings
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
      {/* Header */}
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

      {/* Unconfigured Alert Banner */}
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

      {/* Save Notification Banners */}
      {saveSuccess && <div className={styles.saveSuccess}>{saveSuccess}</div>}
      {saveError && <div className={styles.saveError}>{saveError}</div>}

      <form onSubmit={handleSaveSettings} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
        {/* Section 1: Brand Asset / Logo Management */}
        <div className={styles.sectionCard}>
          <div className={styles.sectionHeader}>
            <ImageIcon size={18} color="var(--color-primary)" aria-hidden="true" />
            <h2 className={styles.sectionTitle}>Brand Logo & Asset Management</h2>
          </div>

          {logoSuccess && <div className={styles.saveSuccess}>{logoSuccess}</div>}
          {logoError && <div className={styles.saveError}>{logoError}</div>}

          <div className={styles.logoLayout}>
            <div className={styles.logoPreviewWrapper}>
              {logoAssetId ? (
                <img
                  src={`/api/assets/${logoAssetId}`}
                  alt="Organization Logo Preview"
                  className={styles.logoImage}
                />
              ) : (
                <div className={styles.logoPlaceholder}>
                  <ImageIcon size={28} aria-hidden="true" />
                  <span>No logo</span>
                </div>
              )}
            </div>

            <div className={styles.logoControls}>
              <div className={styles.logoActionsRow}>
                <label className={styles.uploadLabel}>
                  <UploadCloud size={16} aria-hidden="true" />
                  {logoUploading ? 'Uploading...' : logoAssetId ? 'Change Logo' : 'Upload Logo'}
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    className={styles.uploadInput}
                    onChange={handleLogoUpload}
                    disabled={logoUploading}
                  />
                </label>

                {logoAssetId && (
                  <button
                    type="button"
                    className={styles.deleteLogoBtn}
                    onClick={handleDeleteLogo}
                    disabled={logoUploading}
                  >
                    <Trash2 size={15} aria-hidden="true" />
                    Remove
                  </button>
                )}
              </div>

              <span className={styles.logoHint}>
                PNG, JPEG, or WebP up to 1 MB. Dynamically embedded into official print templates and
                navigation header.
              </span>
            </div>
          </div>
        </div>

        {/* Section 2: Organization Identity */}
        <div className={styles.sectionCard}>
          <div className={styles.sectionHeader}>
            <Building size={18} color="var(--color-primary)" aria-hidden="true" />
            <h2 className={styles.sectionTitle}>Organization Identity & Operating Details</h2>
          </div>

          <div className={styles.formGrid2}>
            <div className={styles.fieldGroup}>
              <label htmlFor="org-name" className={styles.fieldLabel}>
                Organization / Company Legal Name *
              </label>
              <input
                id="org-name"
                required
                maxLength={160}
                className={styles.fieldInput}
                placeholder="e.g. Kisan Cold Storage & Warehousing Pvt. Ltd."
                value={orgName}
                onChange={(e) => setOrgName(e.target.value)}
              />
            </div>

            <div className={styles.fieldGroup}>
              <label htmlFor="org-gstin" className={styles.fieldLabel}>
                GSTIN Registration Number
              </label>
              <input
                id="org-gstin"
                maxLength={15}
                className={styles.fieldInput}
                placeholder="e.g. 09AAACB1234D1Z5"
                value={gstin}
                onChange={(e) => setGstin(e.target.value.toUpperCase())}
              />
            </div>
          </div>

          <div className={styles.fieldGroup}>
            <label htmlFor="org-address" className={styles.fieldLabel}>
              Registered Business Address *
            </label>
            <input
              id="org-address"
              required
              maxLength={500}
              className={styles.fieldInput}
              placeholder="e.g. Plot No. 42, Industrial Cold Zone, Kanpur Road, Lucknow, UP - 226012"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
            />
          </div>

          <div className={styles.formGrid2}>
            <div className={styles.fieldGroup}>
              <label htmlFor="org-contact" className={styles.fieldLabel}>
                Official Contact Numbers / Email *
              </label>
              <input
                id="org-contact"
                required
                maxLength={200}
                className={styles.fieldInput}
                placeholder="e.g. +91 98765 43210, info@kisancoldstorage.in"
                value={contact}
                onChange={(e) => setContact(e.target.value)}
              />
            </div>

            <div className={styles.fieldGroup}>
              <label htmlFor="org-timezone" className={styles.fieldLabel}>
                System Operational Timezone
              </label>
              <select
                id="org-timezone"
                className={styles.fieldSelect}
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
              >
                <option value="Asia/Kolkata">Asia/Kolkata (IST — UTC+5:30)</option>
              </select>
            </div>
          </div>

          <div className={styles.fieldGroup}>
            <label htmlFor="org-footer" className={styles.fieldLabel}>
              Document Print Footer Notes
            </label>
            <textarea
              id="org-footer"
              rows={2}
              maxLength={500}
              className={styles.fieldInput}
              placeholder="e.g. Goods stored at owner's risk under standard warehousing terms. Banking Details: Bank of India A/C: 1234567890."
              value={printFooter}
              onChange={(e) => setPrintFooter(e.target.value)}
            />
          </div>
        </div>

        {/* Section 3: Document Numbering Prefixes */}
        <div className={styles.sectionCard}>
          <div className={styles.sectionHeader}>
            <FileText size={18} color="var(--color-primary)" aria-hidden="true" />
            <h2 className={styles.sectionTitle}>Document Numbering Prefixes</h2>
          </div>

          <div className={styles.formGrid2}>
            <div className={styles.fieldGroup}>
              <label htmlFor="prefix-grn" className={styles.fieldLabel}>
                Inward GRN Number Prefix
              </label>
              <input
                id="prefix-grn"
                required
                maxLength={10}
                className={styles.fieldInput}
                value={grnPrefix}
                onChange={(e) => setGrnPrefix(e.target.value)}
              />
            </div>

            <div className={styles.fieldGroup}>
              <label htmlFor="prefix-receipt" className={styles.fieldLabel}>
                Inward Acknowledgement Receipt Prefix
              </label>
              <input
                id="prefix-receipt"
                required
                maxLength={10}
                className={styles.fieldInput}
                value={receiptPrefix}
                onChange={(e) => setReceiptPrefix(e.target.value)}
              />
            </div>

            <div className={styles.fieldGroup}>
              <label htmlFor="prefix-challan" className={styles.fieldLabel}>
                Outward Delivery Challan Prefix
              </label>
              <input
                id="prefix-challan"
                required
                maxLength={10}
                className={styles.fieldInput}
                value={challanPrefix}
                onChange={(e) => setChallanPrefix(e.target.value)}
              />
            </div>

            <div className={styles.fieldGroup}>
              <label htmlFor="prefix-rent" className={styles.fieldLabel}>
                Rent Payment Receipt Prefix
              </label>
              <input
                id="prefix-rent"
                required
                maxLength={10}
                className={styles.fieldInput}
                value={rentReceiptPrefix}
                onChange={(e) => setRentReceiptPrefix(e.target.value)}
              />
            </div>
          </div>
        </div>

        {/* Section 4: Automated Backup Policy */}
        <div className={styles.sectionCard}>
          <div className={styles.sectionHeader}>
            <Cloud size={18} color="var(--color-primary)" aria-hidden="true" />
            <h2 className={styles.sectionTitle}>Database Backup & Snapshot Policy</h2>
          </div>

          <div className={styles.formGrid2}>
            <div className={styles.fieldGroup}>
              <label htmlFor="atlas-retention" className={styles.fieldLabel}>
                Atlas Snapshot Retention (Days)
              </label>
              <input
                id="atlas-retention"
                type="number"
                min={1}
                max={365}
                required
                className={styles.fieldInput}
                value={atlasRetentionDays}
                onChange={(e) => setAtlasRetentionDays(parseInt(e.target.value, 10) || 7)}
              />
            </div>

            <div className={styles.fieldGroup}>
              <label htmlFor="drive-retention" className={styles.fieldLabel}>
                Google Drive Archive Retention (Days)
              </label>
              <input
                id="drive-retention"
                type="number"
                min={1}
                max={365}
                required
                className={styles.fieldInput}
                value={driveRetentionDays}
                onChange={(e) => setDriveRetentionDays(parseInt(e.target.value, 10) || 30)}
              />
            </div>
          </div>

          <label className={styles.checkboxLabel}>
            <input
              type="checkbox"
              checked={driveBackupEnabled}
              onChange={(e) => setDriveBackupEnabled(e.target.checked)}
            />
            <span>Enable Automated Daily Google Drive Backup Exports</span>
          </label>
        </div>

        {/* Save Footer */}
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
