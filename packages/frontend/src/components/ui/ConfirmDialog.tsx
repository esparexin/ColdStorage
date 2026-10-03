'use client';

import React from 'react';
import { Button } from './Button';
import { Modal, type ModalSize } from './Modal';
import styles from './ConfirmDialog.module.css';

export interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  message: React.ReactNode;
  /** Label for the action that keeps the user where they are. */
  cancelLabel?: string;
  /** Label for the action that discards the pending change and proceeds. */
  confirmLabel?: string;
  onCancel: () => void;
  onConfirm: () => void;
  size?: ModalSize;
  isBusy?: boolean;
}

/**
 * Binary confirmation dialog.
 *
 * Composed entirely from the existing Modal and Button primitives so there is exactly one
 * dialog implementation in the application. Blocking `window.confirm` is prohibited by the
 * architecture boundary rules because it cannot be styled or announced to assistive technology.
 */
export function ConfirmDialog({
  isOpen,
  title,
  message,
  cancelLabel = 'Cancel',
  confirmLabel = 'Confirm',
  onCancel,
  onConfirm,
  size = 'sm',
  isBusy = false,
}: ConfirmDialogProps) {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onCancel}
      title={title}
      size={size}
      footer={
        <>
          <Button variant="outline" onClick={onCancel} disabled={isBusy}>
            {cancelLabel}
          </Button>
          <Button variant="danger" onClick={onConfirm} disabled={isBusy} isLoading={isBusy}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className={styles.message}>{message}</div>
    </Modal>
  );
}