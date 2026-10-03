'use client';

import React from 'react';
import { ChevronDown } from 'lucide-react';
import styles from './Select.module.css';

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string | null;
  helperText?: string;
  rightAction?: React.ReactNode;
}

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  (
    {
      id,
      label,
      error,
      helperText,
      rightAction,
      required,
      className,
      disabled,
      children,
      ...rest
    },
    ref,
  ) => {
    const generatedId = React.useId();
    const selectId = id || generatedId;
    const errorId = error ? `${selectId}-error` : undefined;

    return (
      <div className={`${styles.wrapper} ${error ? styles.hasError : ''} ${className ?? ''}`}>
        {(label || rightAction) && (
          <div className={styles.labelRow}>
            {label && (
              <label htmlFor={selectId} className={styles.label}>
                {label}
                {required && <span className={styles.requiredStar} aria-hidden="true">*</span>}
              </label>
            )}
            {rightAction}
          </div>
        )}

        <div className={styles.selectContainer}>
          <select
            ref={ref}
            id={selectId}
            required={required}
            disabled={disabled}
            aria-invalid={error ? 'true' : undefined}
            aria-describedby={errorId}
            className={styles.select}
            {...rest}
          >
            {children}
          </select>
          <ChevronDown size={14} className={styles.chevronIcon} aria-hidden="true" />
        </div>

        {error && (
          <span id={errorId} className={styles.errorText} role="alert">
            {error}
          </span>
        )}

        {helperText && !error && (
          <span className={styles.helperText}>
            {helperText}
          </span>
        )}
      </div>
    );
  },
);

Select.displayName = 'Select';
