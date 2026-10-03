'use client';

import React from 'react';
import styles from './Badge.module.css';

export type BadgeVariant = 'success' | 'warning' | 'danger' | 'neutral' | 'primary';

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
  icon?: React.ReactNode;
}

export function Badge({
  children,
  variant = 'neutral',
  icon,
  className,
  ...rest
}: BadgeProps) {
  const variantClass = styles[variant] ?? styles.neutral;

  return (
    <span className={`${styles.badge} ${variantClass} ${className ?? ''}`} {...rest}>
      {icon}
      <span>{children}</span>
    </span>
  );
}
