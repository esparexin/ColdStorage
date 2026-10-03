'use client';

import React from 'react';
import styles from './Card.module.css';

export interface CardProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'title'> {
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  headerAction?: React.ReactNode;
  interactive?: boolean;
}

export function Card({
  children,
  title,
  subtitle,
  headerAction,
  interactive = false,
  className,
  ...rest
}: CardProps) {
  return (
    <div
      className={`${styles.card} ${interactive ? styles.interactive : ''} ${className ?? ''}`}
      {...rest}
    >
      {(title || headerAction) && (
        <div className={styles.header}>
          <div>
            {title && <h3 className={styles.title}>{title}</h3>}
            {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
          </div>
          {headerAction && <div>{headerAction}</div>}
        </div>
      )}
      {children}
    </div>
  );
}
