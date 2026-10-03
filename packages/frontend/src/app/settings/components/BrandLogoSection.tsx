'use client';

import React from 'react';
import { Image as ImageIcon, Trash2, UploadCloud } from 'lucide-react';
import styles from '../page.module.css';

interface BrandLogoSectionProps {
  logoAssetId: string | null;
  logoUploading: boolean;
  logoSuccess: string | null;
  logoError: string | null;
  logoDeleteArmed: boolean;
  onLogoUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onDeleteLogo: () => void;
  onCancelDeleteLogo: () => void;
}

export function BrandLogoSection({
  logoAssetId,
  logoUploading,
  logoSuccess,
  logoError,
  logoDeleteArmed,
  onLogoUpload,
  onDeleteLogo,
  onCancelDeleteLogo,
}: BrandLogoSectionProps) {
  return (
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
                onChange={onLogoUpload}
                disabled={logoUploading}
                aria-label="Upload Organization Brand Logo"
              />
            </label>

            {logoAssetId && (
              <button
                type="button"
                className={styles.deleteLogoBtn}
                onClick={onDeleteLogo}
                disabled={logoUploading}
                aria-label={
                  logoDeleteArmed
                    ? 'Confirm removing the organization logo'
                    : 'Remove the organization logo'
                }
              >
                <Trash2 size={15} aria-hidden="true" />
                {logoDeleteArmed ? 'Confirm Remove' : 'Remove'}
              </button>
            )}
          </div>

          {logoDeleteArmed && (
            <div className={styles.saveError} role="alert">
              Removing the logo affects all printed documents.{' '}
              <button
                type="button"
                className={styles.deleteLogoBtn}
                onClick={onCancelDeleteLogo}
                disabled={logoUploading}
              >
                Cancel
              </button>
            </div>
          )}

          <span className={styles.logoHint}>
            PNG, JPEG, or WebP up to 1 MB. Dynamically embedded into official print templates and
            navigation header.
          </span>
        </div>
      </div>
    </div>
  );
}
