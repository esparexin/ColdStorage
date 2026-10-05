'use client';

import React from 'react';
import { AlertCircle, CheckCircle2, Info } from 'lucide-react';
import styles from './Banner.module.css';

export type BannerVariant = 'error' | 'success' | 'info';

export interface BannerProps {
  variant?: BannerVariant;
  message: string;
  id?: string;
}

const ICONS: Record<BannerVariant, React.ReactNode> = {
  error: <AlertCircle size={18} aria-hidden="true" />,
  success: <CheckCircle2 size={18} aria-hidden="true" />,
  info: <Info size={18} aria-hidden="true" />,
};

/**
 * Banner — single SSOT for inline page/section feedback.
 * Replaces per-page `.banner/.bannerError/.bannerSuccess/.saveError/.saveSuccess/.loginError`
 * and inline-style alert divs. Presentation-only; callers own the message state.
 */
export function Banner({ variant = 'error', message, id }: BannerProps) {
  const role = variant === 'error' ? 'alert' : 'status';
  const variantClass =
    variant === 'success' ? styles.bannerSuccess : variant === 'info' ? styles.bannerInfo : styles.bannerError;

  return (
    <div id={id} className={`${styles.banner} ${variantClass}`} role={role}>
      {ICONS[variant]}
      <span>{message}</span>
    </div>
  );
}
