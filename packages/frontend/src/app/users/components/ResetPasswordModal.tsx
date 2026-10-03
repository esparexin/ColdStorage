'use client';

import React, { useState } from 'react';
import { AlertCircle, KeyRound } from 'lucide-react';
import { resetUserPasswordSchema, type UserSummary } from '@cold-storage/contracts';
import { Button, Modal } from '@/components/ui';
import styles from '../page.module.css';

interface ResetPasswordModalProps {
  user: UserSummary;
  saving: boolean;
  error: string | null;
  onSubmit: (userId: string, temporaryPassword: string) => Promise<boolean>;
  onClose: () => void;
}

/**
 * P0-Decision 8: only the Admin issues temporary passwords. Resetting revokes every live
 * session for the account and re-arms the forced password change on next login.
 */
export function ResetPasswordModal({
  user,
  saving,
  error,
  onSubmit,
  onClose,
}: ResetPasswordModalProps) {
  const [temporaryPassword, setTemporaryPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);

    const parsed = resetUserPasswordSchema.safeParse({ temporaryPassword });
    if (!parsed.success) {
      return setLocalError('Temporary password must be at least 8 characters.');
    }
    if (parsed.data.temporaryPassword !== confirmPassword) {
      return setLocalError('Both password entries must match.');
    }

    const succeeded = await onSubmit(user.id, parsed.data.temporaryPassword);
    if (succeeded) onClose();
  };

  const shownError = localError ?? error;

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={`Reset Temporary Password — ${user.fullName}`}
      size="md"
    >
      <form onSubmit={handleSubmit}>
        <div className={styles.modalBody}>
          {shownError && (
            <div className={`${styles.banner} ${styles.bannerError}`} role="alert">
              <AlertCircle size={16} />
              <span>{shownError}</span>
            </div>
          )}

          <div className={styles.formGroupFull}>
            <label htmlFor="reset-user-password">New Temporary Password *</label>
            <input aria-label="Minimum 8 characters (forced reset on first login)"
              id="reset-user-password"
              className={styles.formInput}
              type="password"
              placeholder="Minimum 8 characters (forced reset on first login)"
              value={temporaryPassword}
              onChange={(e) => setTemporaryPassword(e.target.value)}
              minLength={8}
              required
            />
          </div>

          <div className={styles.formGroupFull}>
            <label htmlFor="reset-user-password-confirm">Confirm Temporary Password *</label>
            <input
              id="reset-user-password-confirm"
              className={styles.formInput}
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              minLength={8}
              required
            />
          </div>

          <p className={styles.subtitle}>
            All active sessions for @{user.username} will be revoked immediately. The user must
            change this password at first login.
          </p>
        </div>

        <div className={styles.modalFooter}>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button
            id="submit-user-password-reset-btn"
            type="submit"
            variant="primary"
            disabled={saving}
            isLoading={saving}
            leftIcon={!saving ? <KeyRound size={14} /> : undefined}
          >
            Reset Password
          </Button>
        </div>
      </form>
    </Modal>
  );
}