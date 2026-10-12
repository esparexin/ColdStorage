'use client';

import React, { useMemo, useState } from 'react';
import type { CreateRole, RoleDefinition, UpdateRole, UserSummary } from '@cold-storage/contracts';
import { Banner, ConfirmDialog } from '@/components/ui';
import { usePermissions } from '@/hooks/usePermissions';
import { countUsersByRole } from '../hooks/roleCounts.helper';
import { RoleFormModal } from './RoleFormModal';
import { RolesTable } from './RolesTable';
import styles from '../page.module.css';

interface RolesSectionProps {
  users: UserSummary[];
  roles: RoleDefinition[];
  loading: boolean;
  error: string | null;
  saving: boolean;
  actionError: string | null;
  canManageRoles: boolean;
  showCreate: boolean;
  onShowCreateChange: (open: boolean) => void;
  onCreateRole: (input: CreateRole) => Promise<RoleDefinition | null>;
  onUpdateRole: (id: string, input: UpdateRole) => Promise<RoleDefinition | null>;
  onDeleteRole: (id: string) => Promise<boolean>;
  onRetryRoles: () => void;
  onActionErrorChange: (error: string | null) => void;
  onChanged: () => void;
}

export function RolesSection({
  users,
  roles,
  loading,
  error,
  saving,
  actionError,
  canManageRoles,
  showCreate,
  onShowCreateChange,
  onCreateRole,
  onUpdateRole,
  onDeleteRole,
  onRetryRoles,
  onActionErrorChange,
  onChanged,
}: RolesSectionProps) {
  const { hasPermission } = usePermissions();
  const canDeleteRoles = canManageRoles && hasPermission('role:manage');
  const [editing, setEditing] = useState<RoleDefinition | null>(null);
  const [deleting, setDeleting] = useState<RoleDefinition | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const userCountByRole = useMemo(() => countUsersByRole(users, roles), [users, roles]);

  const assignedCount = (role: RoleDefinition): number => userCountByRole.get(role.id) ?? 0;

  const handleCreate = async (input: CreateRole | UpdateRole) => {
    const created = await onCreateRole(input as CreateRole);
    if (created) {
      setSuccess(`Role "${created.key}" created.`);
      onChanged();
    }
    return created !== null;
  };

  const handleUpdate = async (input: CreateRole | UpdateRole) => {
    if (!editing) return false;
    const updated = await onUpdateRole(editing.id, input as UpdateRole);
    if (updated) {
      setSuccess(`Role "${updated.key}" updated.`);
      setEditing(null);
      onChanged();
    }
    return updated !== null;
  };

  const handleDelete = async () => {
    if (!deleting) return;
    const ok = await onDeleteRole(deleting.id);
    if (ok) {
      setSuccess(`Role "${deleting.key}" deleted.`);
      setDeleting(null);
      onChanged();
    }
  };

  return (
    <section className={styles.tableSection} aria-label="Role configuration">
      <header className={styles.headerRow}>
        <div className={styles.titleArea}>
          <h2 style={{ fontSize: 'var(--text-base)', margin: 0 }}>Configurable Roles</h2>
          <p className={styles.unauthorizedHint}>System roles are locked. Custom roles grant subsets of permissions.</p>
        </div>
      </header>

      {success && <Banner variant="success" message={success} />}
      {actionError && <Banner message={actionError} />}

      <RolesTable
        roles={roles}
        loading={loading}
        error={error}
        userCountByRole={userCountByRole}
        canManageRoles={canDeleteRoles}
        onRetry={onRetryRoles}
        onEdit={setEditing}
        onDelete={setDeleting}
        onCreate={() => onShowCreateChange(true)}
      />

      {showCreate && (
        <RoleFormModal
          saving={saving}
          error={actionError}
          onClose={() => {
            onShowCreateChange(false);
            onActionErrorChange(null);
          }}
          onSubmit={handleCreate}
        />
      )}
      {editing && (
        <RoleFormModal
          role={editing}
          assignedUsers={assignedCount(editing)}
          saving={saving}
          error={actionError}
          onClose={() => {
            setEditing(null);
            onActionErrorChange(null);
          }}
          onSubmit={handleUpdate}
        />
      )}
      {deleting && (
        <ConfirmDialog
          isOpen
          title={`Delete role ${deleting.key}?`}
          message="Custom roles assigned to users cannot be deleted. This cannot be undone."
          confirmLabel="Delete"
          onConfirm={() => void handleDelete()}
          onCancel={() => setDeleting(null)}
        />
      )}
    </section>
  );
}
