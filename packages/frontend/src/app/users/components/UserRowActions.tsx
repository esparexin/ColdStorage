'use client';

import React from 'react';
import { KeyRound, Pencil, UserCheck, UserX } from 'lucide-react';
import type { UserSummary } from '@cold-storage/contracts';
import { Button } from '@/components/ui';
import styles from '../page.module.css';

interface UserRowActionsProps {
  user: UserSummary;
  isSelf: boolean;
  busy: boolean;
  onEdit: (user: UserSummary) => void;
  onResetPassword: (user: UserSummary) => void;
  onToggleStatus: (user: UserSummary) => void;
}

/**
 * Lifecycle controls for a single user row. Deactivation is a status transition (never a hard
 * delete) so the immutable audit trail retains its referent.
 */
export function UserRowActions({
  user,
  isSelf,
  busy,
  onEdit,
  onResetPassword,
  onToggleStatus,
}: UserRowActionsProps) {
  const isActive = user.status === 'ACTIVE';

  return (
    <div className={styles.rowActions}>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => onEdit(user)}
        disabled={busy}
        aria-label={`Edit ${user.fullName}`}
        leftIcon={<Pencil size={14} aria-hidden="true" />}
      >
        Edit
      </Button>

      <Button
        variant="ghost"
        size="sm"
        onClick={() => onResetPassword(user)}
        disabled={busy}
        aria-label={`Reset password for ${user.fullName}`}
        leftIcon={<KeyRound size={14} aria-hidden="true" />}
      >
        Reset
      </Button>

      {isSelf ? (
        <span className={styles.codeText}>Current account</span>
      ) : (
        <Button
          variant={isActive ? 'outline' : 'primary'}
          size="sm"
          onClick={() => onToggleStatus(user)}
          disabled={busy}
          aria-label={`${isActive ? 'Disable' : 'Enable'} ${user.fullName}`}
          leftIcon={
            isActive ? (
              <UserX size={14} aria-hidden="true" />
            ) : (
              <UserCheck size={14} aria-hidden="true" />
            )
          }
        >
          {isActive ? 'Disable' : 'Enable'}
        </Button>
      )}
    </div>
  );
}