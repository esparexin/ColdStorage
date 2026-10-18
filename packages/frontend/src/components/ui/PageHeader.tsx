'use client';

import React from 'react';
import styles from './PageHeader.module.css';

export interface PageHeaderProps {
  title: string;
  subtitle?: string;
  badge?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
  id?: string;
}

export function PageHeader({
  title,
  subtitle,
  badge,
  actions,
  className = '',
  id,
}: PageHeaderProps) {
  return (
    <header className={`${styles.headerRow} ${className}`.trim()} id={id}>
      <div className={styles.titleArea}>
        <div className={styles.titleWithBadge}>
          <h1 className={styles.pageTitle}>{title}</h1>
          {badge}
        </div>
        {subtitle && <p className={styles.pageSubtitle}>{subtitle}</p>}
      </div>
      {actions && <div className={styles.headerActions}>{actions}</div>}
    </header>
  );
}
