'use client';

import React from 'react';
import { KeyRound, Pencil, UserCheck, UserX } from 'lucide-react';
import type { UserSummary } from '@cold-storage/contracts';
import { Button, OverflowMenu, type OverflowMenuItem } from '@/components/ui';
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
 * Lifecycle controls for a single user row. Edit is the primary action,
 * while status toggle and password reset are organized into the canonical OverflowMenu.
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

  const secondaryItems: OverflowMenuItem[] = [
    {
      key: 'reset-password',
      label: 'Reset Password',
      icon: <KeyRound size={14} aria-hidden="true" />,
      disabled: busy,
      onClick: () => onResetPassword(user),
    },
    ...(!isSelf
      ? [
          {
            key: 'toggle-status',
            label: isActive ? 'Disable User' : 'Enable User',
            icon: isActive ? (
              <UserX size={14} aria-hidden="true" />
            ) : (
              <UserCheck size={14} aria-hidden="true" />
            ),
            danger: isActive,
            disabled: busy,
            onClick: () => onToggleStatus(user),
          },
        ]
      : []),
  ];

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

      {isSelf && <span className={styles.codeText}>Current account</span>}

      <OverflowMenu
        items={secondaryItems}
        ariaLabel={`More actions for user ${user.fullName}`}
      />
    </div>
  );
}