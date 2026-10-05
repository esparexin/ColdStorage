'use client';

import React, { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Banner } from '@/components/ui/Banner';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { useAuth } from '@/context/AuthContext';
import styles from './ChangePasswordModal.module.css';

interface ChangePasswordModalProps {
  isOpen: boolean;
}

export function ChangePasswordModal({ isOpen }: ChangePasswordModalProps) {
  const { user, changePassword, logout } = useAuth();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen || !user) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (newPassword.length < 8) {
      setError('New password must be at least 8 characters long');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('New password and confirmation do not match');
      return;
    }

    if (currentPassword === newPassword) {
      setError('New password must be different from current temporary password');
      return;
    }

    setIsSubmitting(true);
    try {
      await changePassword(currentPassword, newPassword);
      // Success: AuthContext re-logins and clears mustChangePassword, which
      // unmounts this modal via ResponsiveShell. Reset local state so a
      // delayed unmount never leaves disabled inputs on screen.
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to change password';
      setError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleLogout = async () => {
    setIsSubmitting(true);
    await logout();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleLogout}
      title="Set New Password"
      subtitle="Initial password change required"
      size="sm"
    >
      <form onSubmit={handleSubmit} className={styles.form}>
        <div className={styles.notice}>
          Your account was provisioned with a temporary password. You must set a personal password before continuing.
        </div>

        {error && <Banner message={error} id="change-password-error" />}

        <Input
          id="force-current-password"
          label="Current Temporary Password"
          name="current-password"
          type="password"
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
          autoComplete="current-password"
          required
          disabled={isSubmitting}
          placeholder="Enter temporary password"
        />

        <Input
          id="new-password"
          label="New Password"
          name="new-password"
          type="password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          autoComplete="new-password"
          required
          minLength={8}
          disabled={isSubmitting}
          placeholder="Minimum 8 characters"
          helperText="Must be at least 8 characters"
        />

        <Input
          id="confirm-password"
          label="Confirm New Password"
          name="confirm-password"
          type="password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          autoComplete="new-password"
          required
          minLength={8}
          disabled={isSubmitting}
          placeholder="Re-enter new password"
        />

        <div className={styles.actions}>
          <Button
            type="button"
            variant="outline"
            onClick={handleLogout}
            disabled={isSubmitting}
          >
            Sign Out
          </Button>
          <Button
            type="submit"
            variant="primary"
            disabled={isSubmitting}
            isLoading={isSubmitting}
          >
            {isSubmitting ? 'Updating…' : 'Update Password'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
