'use client';

import React from 'react';
import styles from './StatCard.module.css';

export type StatAccent = 'primary' | 'success' | 'warning' | 'danger';

export interface StatCardProps {
  /** Uppercase micro-label describing the metric. */
  label: string;
  value: React.ReactNode;
  /**
   * Semantic colour for the value, e.g. success for a collected total or
   * warning for an outstanding balance. Omit for the default text colour.
   */
  accent?: StatAccent;
}

/**
 * One metric inside a StatGrid. The grid draws the surrounding surface and the
 * hairline dividers, so a tile carries no border, shadow or decorative chrome.
 * Supporting prose belongs outside the tile; the label alone states the metric.
 */
export function StatCard({ label, value, accent }: StatCardProps) {
  return (
    <div className={styles.statItem} data-accent={accent ?? 'default'}>
      <span className={styles.statLabel}>{label}</span>
      <span className={styles.statValue}>{value}</span>
    </div>
  );
}

export interface StatGridProps {
  /** Accessible name for the KPI region. */
  label: string;
  children: React.ReactNode;
  /** Minimum tile width before wrapping (px). */
  minTileWidth?: number;
}

export function StatGrid({ label, children, minTileWidth = 150 }: StatGridProps) {
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