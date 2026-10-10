'use client';

import React from 'react';
import { Pencil, Trash2 } from 'lucide-react';
import type { RoleDefinition } from '@cold-storage/contracts';
import { Badge, Button } from '@/components/ui';
import { DataTable, type DataTableColumn } from '@/components/ui/DataTable';
import { EMPTY_MESSAGES, LOADING_LABELS } from '@/components/ui/stateCopy';
import styles from '../page.module.css';

interface RolesTableProps {
  roles: RoleDefinition[];
  loading: boolean;
  error?: string | null;
  userCountByRole: Map<string, number>;
  canManageRoles: boolean;
  onRetry: () => void;
  onEdit: (role: RoleDefinition) => void;
  onDelete: (role: RoleDefinition) => void;
  onCreate: () => void;
}

export function RolesTable({
  roles,
  loading,
  error,
  userCountByRole,
  canManageRoles,
  onRetry,
  onEdit,
  onDelete,
  onCreate,
}: RolesTableProps) {
  const columns: DataTableColumn<RoleDefinition>[] = [
    {
      key: 'role',
      header: 'Role',
      render: (r) => (
        <div className={styles.userInfo}>
          <span className={styles.userName}>{r.displayName}</span>
          <span className={styles.userHandle}>{r.key}</span>
        </div>
      ),
    },
    {
      key: 'type',
      header: 'Type',
      render: (r) => <Badge variant={r.isSystem ? 'primary' : 'neutral'}>{r.isSystem ? 'System' : 'Custom'}</Badge>,
    },
    {
      key: 'permissions',
      header: 'Permissions',
      render: (r) => <span className={styles.codeText}>{r.permissions.length}</span>,
    },
    {
      key: 'scope',
      header: 'Facility Scope',
      render: (r) => (
        <span className={styles.facilityTag}>{r.hasGlobalFacilityScope ? 'Global' : 'Assigned only'}</span>
      ),
    },
    {
      key: 'users',
      header: 'Users',
      render: (r) => <span className={styles.codeText}>{userCountByRole.get(r.id) ?? 0}</span>,
    },
    {
      key: 'actions',
      header: 'Actions',
      render: (r) =>
        r.isSystem || !canManageRoles ? (
          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)' }}>Locked</span>
        ) : (
          <span className={styles.rowActions}>
            <Button variant="outline" aria-label={`Edit role ${r.key}`} onClick={() => onEdit(r)}>
              <Pencil size={14} aria-hidden="true" />
            </Button>
            <Button variant="outline" aria-label={`Delete role ${r.key}`} onClick={() => onDelete(r)}>
              <Trash2 size={14} aria-hidden="true" />
            </Button>
          </span>
        ),
    },
  ];

  return (
    <DataTable
      columns={columns}
      rows={roles}
      rowKey={(r) => r.id}
      caption="Configurable roles"
      loading={loading}
      loadingLabel={LOADING_LABELS.users}
      error={error}
      onRetry={onRetry}
      emptyMessage={EMPTY_MESSAGES.usersEmpty}
      emptyAction={
        canManageRoles
          ? { label: 'Create First Role', onClick: onCreate, id: 'empty-create-role-btn' }
          : undefined
      }
    />
  );
}
