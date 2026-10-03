'use client';

import React from 'react';
import styles from './StatCard.module.css';

export type StatAccent = 'primary' | 'success' | 'warning' | 'danger';

export interface StatCardProps {
  label: string;
  value: React.ReactNode;
  sub?: string;
  icon?: React.ElementType;
  iconSize?: number;
  accent?: StatAccent;
  /** Renders the value in the accent colour (used for semantic totals). */
  accentValue?: boolean;
}

export function StatCard({
  label,
  value,
  sub,
  icon: Icon,
  iconSize = 24,
  accent = 'primary',
  accentValue = false,
}: StatCardProps) {
  return (
    <article className={styles.statCard} data-accent={accent}>
      {Icon && (
        <span className={styles.statIcon} aria-hidden="true">
          <Icon size={iconSize} />
        </span>
      )}
      <span className={styles.statBody}>
        <span className={styles.statLabel}>{label}</span>
        <span className={`${styles.statValue} ${accentValue ? styles.statValueAccent : ''}`}>
          {value}
        </span>
        {sub && <span className={styles.statSub}>{sub}</span>}
      </span>
    </article>
  );
}

export interface StatGridProps {
  /** Accessible name for the KPI region. */
  label: string;
  children: React.ReactNode;
  /** Minimum tile width before wrapping (px). */
  minTileWidth?: number;
}

export function StatGrid({ label, children, minTileWidth = 200 }: StatGridProps) {
  return (
    <section
      className={styles.statGrid}
      aria-label={label}
      style={{ '--stat-min': `${minTileWidth}px` } as React.CSSProperties}
    >
      {children}
    </section>
  );
}