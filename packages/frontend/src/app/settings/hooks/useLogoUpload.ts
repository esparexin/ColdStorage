'use client';

import { useState } from 'react';
import { requestWithAuth } from '@/lib/api-client';

const MAX_LOGO_BYTES = 1024 * 1024;
const ALLOWED_LOGO_TYPES = ['image/png', 'image/jpeg', 'image/webp'];

export interface LogoUploadState {
  logoUploading: boolean;
  logoError: string | null;
  logoSuccess: string | null;
  logoDeleteArmed: boolean;
  setLogoDeleteArmed: (armed: boolean) => void;
  handleLogoUpload: (e: React.ChangeEvent<HTMLInputElement>) => Promise<void>;
  handleDeleteLogo: () => Promise<void>;
}

/**
 * Brand logo upload and removal.
 *
 * Removal is a two-step, in-UI confirmation rather than a blocking browser dialog, so it can be
 * styled, announced to assistive technology, and composed with the section's error and success
 * messaging. `onAssetIdChange` lets the caller keep its dirty-state baseline in step so a
 * successful upload is not mistaken for an unsaved text edit.
 */
export function useLogoUpload(onAssetIdChange: (assetId: string | null) => void): LogoUploadState {
  const [logoUploading, setLogoUploading] = useState(false);
  const [logoError, setLogoError] = useState<string | null>(null);
  const [logoSuccess, setLogoSuccess] = useState<string | null>(null);
  const [logoDeleteArmed, setLogoDeleteArmed] = useState(false);

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > MAX_LOGO_BYTES) {
      setLogoError('Logo file size exceeds the 1 MB limit.');
      return;
    }
    if (!ALLOWED_LOGO_TYPES.includes(file.type)) {
      setLogoError('Only PNG, JPEG, or WebP images are allowed.');
      return;
    }

    setLogoUploading(true);
    setLogoError(null);
    setLogoSuccess(null);

    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await requestWithAuth('/api/settings/logo', { method: 'POST', body: formData });
      if (!res.ok) {
        const err = (await res.json()) as { error?: string };
        throw new Error(err.error ?? `Upload failed with HTTP ${res.status}`);
      }
      const data = (await res.json()) as { asset: { id: string } };
      onAssetIdChange(data.asset.id);
      setLogoSuccess('Brand logo uploaded and bound to organization settings.');
    } catch (err: unknown) {
      setLogoError(err instanceof Error ? err.message : 'Logo upload failed');
    } finally {
      setLogoUploading(false);
      e.target.value = '';
    }
  };

  const handleDeleteLogo = async () => {
    if (!logoDeleteArmed) {
      setLogoDeleteArmed(true);
      return;
    }

    setLogoDeleteArmed(false);
    setLogoUploading(true);
    setLogoError(null);
    setLogoSuccess(null);

    try {
      const res = await requestWithAuth('/api/settings/logo', { method: 'DELETE' });
      if (!res.ok) {
        const err = (await res.json()) as { error?: string };
        throw new Error(err.error ?? `Deletion failed with HTTP ${res.status}`);
      }
      onAssetIdChange(null);
      setLogoSuccess('Logo removed successfully.');
    } catch (err: unknown) {
      setLogoError(err instanceof Error ? err.message : 'Failed to delete logo');
    } finally {
      setLogoUploading(false);
    }
  };

  return {
    logoUploading,
    logoError,
    logoSuccess,
    logoDeleteArmed,
    setLogoDeleteArmed,
    handleLogoUpload,
    handleDeleteLogo,
  };
}