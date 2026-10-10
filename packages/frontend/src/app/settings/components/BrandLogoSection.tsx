'use client';

import React from 'react';
import { Image as ImageIcon, Trash2, UploadCloud } from 'lucide-react';
import { Banner, Button } from '@/components/ui';
import { LOADING_LABELS } from '@/components/ui/stateCopy';
import styles from './BrandLogoSection.module.css';

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
    <div className={styles.root}>
      {/* The surrounding tab panel already provides the heading, so no inner header is needed. */}

      {logoSuccess && <Banner variant="success" message={logoSuccess} />}
      {logoError && <Banner message={logoError} id="logo-error" />}

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
              {logoUploading ? LOADING_LABELS.uploading : logoAssetId ? 'Change Logo' : 'Upload Logo'}
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
              <Button
                type="button"
                variant={logoDeleteArmed ? 'danger' : 'outline'}
                size="sm"
                onClick={onDeleteLogo}
                disabled={logoUploading}
                aria-label={
                  logoDeleteArmed
                    ? 'Confirm removing the organization logo'
                    : 'Remove the organization logo'
                }
                leftIcon={<Trash2 size={15} aria-hidden="true" />}
              >
                {logoDeleteArmed ? 'Confirm Remove' : 'Remove'}
              </Button>
            )}
          </div>

          {logoDeleteArmed && (
            <>
              <Banner
                message="Removing the logo affects all printed documents."
                id="logo-delete-warning"
              />
              <div style={{ marginTop: 'var(--space-2)' }}>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={onCancelDeleteLogo}
                  disabled={logoUploading}
                >
                  Cancel
                </Button>
              </div>
            </>
          )}

          <span className={styles.logoHint}>
            PNG, JPEG or WebP, up to 1 MB.
          </span>
        </div>
      </div>
    </div>
  );
}
