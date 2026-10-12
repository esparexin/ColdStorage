'use client';

import React, { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import styles from './Modal.module.css';

export type ModalSize = 'sm' | 'md' | 'lg' | 'xl';

export interface ModalProps {
  isOpen?: boolean;
  onClose: () => void;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  headerActions?: React.ReactNode;
  size?: ModalSize;
  children: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
}

const activeModalStack: string[] = [];

export function Modal({
  isOpen = true,
  onClose,
  title,
  subtitle,
  headerActions,
  size = 'md',
  children,
  footer,
  className,
}: ModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);
  const titleId = React.useId();
  const subtitleId = React.useId();
  const instanceId = React.useId();

  // Track active modal in stack
  useEffect(() => {
    if (!isOpen) return;
    activeModalStack.push(instanceId);
    return () => {
      const idx = activeModalStack.lastIndexOf(instanceId);
      if (idx !== -1) activeModalStack.splice(idx, 1);
    };
  }, [isOpen, instanceId]);

  // Handle keyboard events (Escape dismiss for top-most modal; prevent Backspace outside inputs)
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        const isTopModal = activeModalStack[activeModalStack.length - 1] === instanceId;
        if (isTopModal) {
          e.stopPropagation();
          onClose();
        }
        return;
      }

      if (e.key === 'Backspace' || e.key === 'Delete') {
        const target = e.target as HTMLElement | null;
        const isEditable = Boolean(
          target &&
            (target.tagName === 'INPUT' ||
              target.tagName === 'TEXTAREA' ||
              target.isContentEditable),
        );
        if (!isEditable) {
          e.preventDefault();
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, instanceId, onClose]);

  // Trap focus
  useEffect(() => {
    if (!isOpen || !modalRef.current) return;

    const focusableElements = modalRef.current.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    );
    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];

    firstElement?.focus();

    const handleTabKey = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;

      if (e.shiftKey) {
        if (document.activeElement === firstElement) {
          e.preventDefault();
          lastElement?.focus();
        }
      } else {
        if (document.activeElement === lastElement) {
          e.preventDefault();
          firstElement?.focus();
        }
      }
    };

    document.addEventListener('keydown', handleTabKey);
    return () => document.removeEventListener('keydown', handleTabKey);
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div
      className={styles.backdrop}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={subtitle ? subtitleId : undefined}
        tabIndex={-1}
        className={`${styles.modal} ${styles[size]} ${className ?? ''}`}
      >
        <div className={styles.header}>
          <div className={styles.titleArea}>
            <h2 id={titleId} className={styles.title}>
              {title}
            </h2>
            {subtitle && (
              <span id={subtitleId} className={styles.subtitle}>
                {subtitle}
              </span>
            )}
          </div>
          <div className={styles.headerRight}>
            {headerActions}
            <button
              type="button"
              onClick={onClose}
              className={styles.closeButton}
              aria-label="Close dialog"
            >
              <X size={16} aria-hidden="true" />
            </button>
          </div>
        </div>

        <div className={styles.body}>{children}</div>

        {footer && <div className={styles.footer}>{footer}</div>}
      </div>
    </div>
  );
}
