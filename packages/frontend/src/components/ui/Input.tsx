'use client';

import React from 'react';
import styles from './Input.module.css';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string | null;
  helperText?: string;
  prefixIcon?: React.ReactNode;
  rightAction?: React.ReactNode;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  (
    {
      id,
      label,
      error,
      helperText,
      prefixIcon,
      rightAction,
      required,
      className,
      disabled,
      ...rest
    },
    ref,
  ) => {
    const generatedId = React.useId();
    const inputId = id || generatedId;
    const errorId = error ? `${inputId}-error` : undefined;
    const helperId = helperText ? `${inputId}-helper` : undefined;
    const describedBy = [errorId, helperId].filter(Boolean).join(' ') || undefined;

    return (
      <div className={`${styles.wrapper} ${error ? styles.hasError : ''} ${className ?? ''}`}>
        {(label || rightAction) && (
          <div className={styles.labelRow}>
            {label && (
              <label htmlFor={inputId} className={styles.label}>
                {label}
                {required && <span className={styles.requiredStar} aria-hidden="true">*</span>}
              </label>
            )}
            {rightAction}
          </div>
        )}

        <div className={`${styles.inputContainer} ${prefixIcon ? styles.hasPrefixIcon : ''}`}>
          {prefixIcon && <span className={styles.prefixIcon}>{prefixIcon}</span>}
          <input
            ref={ref}
            id={inputId}
            required={required}
            disabled={disabled}
            aria-invalid={error ? 'true' : undefined}
            aria-describedby={describedBy}
            className={styles.input}
            {...rest}
          />
        </div>

        {error && (
          <span id={errorId} className={styles.errorText} role="alert">
            {error}
          </span>
        )}

        {helperText && !error && (
          <span id={helperId} className={styles.helperText}>
            {helperText}
          </span>
        )}
      </div>
    );
  },
);

Input.displayName = 'Input';
